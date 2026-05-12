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
import { RealtimeBridge, NTT_CPAAS_REALTIME_AUDIO } from "./realtime-bridge";
import { NttCpaasConnectedMessage, NttCpaasTextMessage } from "./ntt-cpaas-stream.types";

const MEDIA_STREAM_PATH = "/ntt-cpaas/media-stream";

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
   * main.ts の bootstrap から HTTP サーバーを受け取り、NTT CPaaS WebSocket
   * endpoint 用の raw ws サーバーを同一ポートにマウントする。
   */
  attach(httpServer: HttpServer) {
    if (this.wss) return;

    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on("upgrade", (req, socket, head) => {
      const url = req.url ?? "";
      this.logger.log(`WS upgrade attempt: url=${url} host=${req.headers.host} ua=${req.headers["user-agent"] ?? "(none)"}`);
      if (!url.startsWith(MEDIA_STREAM_PATH)) {
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(req, socket, head, (ws) => {
        this.logger.log(`WS upgrade completed for ${url}`);
        this.wss!.emit("connection", ws, req);
      });
    });

    this.wss.on("connection", (ws, req) => {
      this.logger.log(`WS connection received: url=${req.url}`);
      this.handleConnection(ws, req).catch((err) => {
        this.logger.error(`Connection handler failed: ${(err as Error).message}`);
        try {
          ws.close();
        } catch {
          /* noop */
        }
      });
    });

    this.logger.log(
      `NTT CPaaS media stream WS endpoint: ${MEDIA_STREAM_PATH} ` +
      `(${NTT_CPAAS_REALTIME_AUDIO.sampleRate}Hz/${NTT_CPAAS_REALTIME_AUDIO.frameBytes} bytes)`
    );
  }

  async onApplicationShutdown() {
    for (const bridge of this.bridges) bridge.shutdown("server_shutdown");
    this.bridges.clear();
    this.wss?.close();
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.logger.error("OPENAI_API_KEY is not set; closing media stream connection");
      ws.close();
      return;
    }

    const connected = await this.waitForConnected(ws);
    const url = new URL(req.url ?? "", "http://localhost");

    const phoneNumberId = url.searchParams.get("phoneNumberId") ?? connected.phoneNumberId;
    const explicitCompanyId = url.searchParams.get("companyId") ?? connected.companyId;
    const explicitFlowId = url.searchParams.get("flowId") ?? connected.flowId;
    const explicitSessionId = url.searchParams.get("callSessionId") ?? connected.callSessionId;
    const providerCallId = url.searchParams.get("callId") ?? connected.callId;

    let companyId = explicitCompanyId;
    let flowId = explicitFlowId || null;
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

    let compiled = this.compiler.compile(null, null);
    if (flowId) {
      const flow = await this.prisma.callFlow.findUnique({ where: { id: flowId } });
      if (flow) {
        compiled = this.compiler.compile(flow.flowJson, flow.name);
      }
    }

    let callSessionId: string | null = explicitSessionId ?? null;
    if (!callSessionId && providerCallId) {
      const session = await this.prisma.callSession.findFirst({
        where: { providerCallId },
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
      }
    );
    this.bridges.add(bridge);
    ws.once("close", () => this.bridges.delete(bridge));
    await bridge.start(providerCallId);
  }

  private waitForConnected(ws: WebSocket): Promise<NttCpaasConnectedMessage> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const cleanup = () => {
        clearTimeout(timer);
        ws.off("message", onMessage);
        ws.off("close", onClose);
        ws.off("error", onError);
      };

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn();
      };

      const onMessage = (raw: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
          this.logger.warn("NTT CPaaS sent binary audio before websocket:connected");
          return;
        }

        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf8");
          const message = JSON.parse(text) as NttCpaasTextMessage;
          if (message.event === "websocket:connected") {
            settle(() => resolve(message));
          }
        } catch (err) {
          this.logger.warn(`Failed to parse initial NTT CPaaS message: ${(err as Error).message}`);
        }
      };

      const onClose = () => settle(() => reject(new Error("NTT CPaaS media stream closed before connected event")));
      const onError = (err: Error) => settle(() => reject(err));
      const timer = setTimeout(
        () => settle(() => reject(new Error("Timed out waiting for NTT CPaaS websocket:connected"))),
        5000
      );

      ws.on("message", onMessage);
      ws.once("close", onClose);
      ws.once("error", onError);
    });
  }
}
