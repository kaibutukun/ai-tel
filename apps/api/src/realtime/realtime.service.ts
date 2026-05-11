import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";
import { PrismaService } from "../prisma/prisma.service";
import { FlowCompilerService } from "../call-flows/flow-compiler.service";
import { ToolExecutorService } from "./tool-executor.service";
import { RealtimeBridge } from "./realtime-bridge";

// ─────────────────────────────────────────────────────────────
// RealtimeService
//
// 通話ごとに WebSocket をハンドルし、RealtimeBridge を生成する。
//
// Twilio Media Streams の <Stream url="wss://.../twilio/media-stream">
// に対し、HTTP サーバーの upgrade を捕まえてこのサービスへ振り分ける。
//
// 設計上の制約:
//   - NestJS の HTTP アダプタ (Express) の `server` を取り、その上に
//     `ws` の WebSocketServer (noServer モード) を載せる。
//   - 接続時のクエリパラメータ companyId / flowId / phoneNumberId を使って
//     どのフローを使うかを決める。
//     (Twilio の <Parameter> でも同じ値を customParameters として渡せるので
//      どちらか取りやすい方を使う。ここではクエリパラメータ優先。)
// ─────────────────────────────────────────────────────────────

const MEDIA_STREAM_PATH = "/twilio/media-stream";

@Injectable()
export class RealtimeService implements OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeService.name);
  private wss: WebSocketServer | null = null;
  private bridges = new Set<RealtimeBridge>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly compiler: FlowCompilerService,
    private readonly toolExecutor: ToolExecutorService
  ) {}

  /**
   * main.ts の bootstrap から HTTP サーバーを受け取り、WebSocket をマウントする。
   * Nest 側で WebSocket gateway を使うと socket.io 等のレイヤを通すので、
   * Twilio との互換性のため "raw ws" を直接張る方が単純。
   */
  attach(httpServer: HttpServer) {
    if (this.wss) return; // 二重マウント防止

    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req, socket, head) => {
      const url = req.url ?? "";
      // パス一致のみ受け付ける（他の WS 用途と衝突しないため）
      if (!url.startsWith(MEDIA_STREAM_PATH)) return;

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.wss!.emit("connection", ws, req);
      });
    });

    this.wss.on("connection", (ws, req) => {
      this.handleConnection(ws, req).catch((err) => {
        this.logger.error(`Connection handler failed: ${(err as Error).message}`);
        try {
          ws.close();
        } catch {
          /* noop */
        }
      });
    });

    this.logger.log(`Twilio media stream WS endpoint: ${MEDIA_STREAM_PATH}`);
  }

  async onApplicationShutdown() {
    for (const bridge of this.bridges) bridge.shutdown("server_shutdown");
    this.bridges.clear();
    this.wss?.close();
  }

  // ────────────────────────────────────────────
  // 接続処理
  // ────────────────────────────────────────────

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error("OPENAI_API_KEY is not set; closing media stream connection");
      ws.close();
      return;
    }

    // クエリパラメータから誰の通話か特定する
    const url = new URL(req.url ?? "", "http://localhost"); // ベースは仮（path/query 取得用）
    const phoneNumberId = url.searchParams.get("phoneNumberId");
    const explicitCompanyId = url.searchParams.get("companyId");
    const explicitFlowId = url.searchParams.get("flowId");

    let companyId = explicitCompanyId;
    let flowId = explicitFlowId;
    let transferTo: string | undefined;
    let notifyTarget: string | undefined;

    if (phoneNumberId) {
      const pn = await this.prisma.phoneNumber.findUnique({
        where: { id: phoneNumberId },
        include: { callFlow: true },
      });
      if (pn) {
        companyId = companyId ?? pn.companyId ?? null;
        flowId = flowId ?? pn.callFlowId ?? null;
        transferTo = pn.transferTo ?? undefined;
      }
    }

    if (!companyId) {
      this.logger.warn("companyId could not be resolved; closing media stream");
      ws.close();
      return;
    }

    // フロー JSON を読み込んでコンパイル
    let compiled = this.compiler.compile(null, null);
    if (flowId) {
      const flow = await this.prisma.callFlow.findUnique({ where: { id: flowId } });
      if (flow) {
        compiled = this.compiler.compile(flow.flowJson, flow.name);
      }
    }

    // 通話ログのレコードと紐付ける（Twilio voice webhook 側で既に作られていればそれを使う）
    let callSessionId: string | null = null;
    const callSidFromQuery = url.searchParams.get("callSid");
    if (callSidFromQuery) {
      const session = await this.prisma.callSession.findFirst({
        where: { twilioCallSid: callSidFromQuery },
        select: { id: true },
      });
      callSessionId = session?.id ?? null;
    }

    const bridge = new RealtimeBridge(
      ws,
      compiled,
      {
        companyId,
        callFlowId: flowId ?? null,
        callSessionId,
        transferTo,
        notifyTarget,
        ragPrecision: compiled.ragPrecision,
      },
      {
        openAiApiKey: apiKey,
        toolExecutor: this.toolExecutor,
        // TODO: 転送実装は次フェーズで Twilio REST API 連携を追加
      }
    );
    this.bridges.add(bridge);
    ws.once("close", () => this.bridges.delete(bridge));
  }
}
