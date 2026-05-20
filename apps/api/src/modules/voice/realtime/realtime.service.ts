import {
  Injectable,
  Logger,
  OnApplicationShutdown,
} from "@nestjs/common";
import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import WebSocket = require("ws");
import { PrismaService } from "../../../database/prisma.service";
import { FlowCompilerService } from "../call-flows/application/flow-compiler.service";
import { ToolExecutorService } from "./tool-executor.service";
import {
  BridgeObserverEvent,
  RealtimeBridge,
  NTT_CPAAS_REALTIME_AUDIO,
} from "./realtime-bridge";
import {
  NttCpaasConnectedMessage,
  NttCpaasTextMessage,
} from "./ntt-cpaas-stream.types";

const MEDIA_STREAM_PATH = "/ntt-cpaas/media-stream";
const DEV_MEDIA_STREAM_PATH = "/dev-call/media-stream";

type DevCallStartMessage = {
  event: "dev_call:start";
  companyId?: string;
  flowId?: string;
  phoneNumberId?: string;
  callerNumber?: string;
};

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
      const isCpaasStream = url.startsWith(MEDIA_STREAM_PATH);
      const isDevStream = url.startsWith(DEV_MEDIA_STREAM_PATH);
      if (!isCpaasStream && !isDevStream) {
        socket.destroy();
        return;
      }

      if (isDevStream && process.env.NODE_ENV === "production") {
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
      const handler = (req.url ?? "").startsWith(DEV_MEDIA_STREAM_PATH)
        ? this.handleDevConnection(ws, req)
        : this.handleConnection(ws, req);
      handler.catch((err) => {
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
    if (process.env.NODE_ENV !== "production") {
      this.logger.log(`Dev browser call WS endpoint: ${DEV_MEDIA_STREAM_PATH}`);
    }
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
        faqMinScore: compiled.faqMinScore,
        documentMinScore: compiled.documentMinScore,
      },
      {
        openAiApiKey: apiKey,
        toolExecutor: this.toolExecutor,
        saveTranscript: (data) => this.persistTranscript(data),
        markSessionEnded: (data) => this.markSessionEnded(data),
      }
    );
    this.bridges.add(bridge);
    ws.once("close", () => this.bridges.delete(bridge));
    await bridge.start(providerCallId);
  }

  private async handleDevConnection(ws: WebSocket, req: IncomingMessage) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.sendDevJson(ws, {
        type: "error",
        message: "OPENAI_API_KEY is not set; dev call cannot start",
      });
      ws.close();
      return;
    }

    const start = await this.waitForDevStart(ws);
    this.logger.log(
      `Dev call OPENAI_API_KEY source=${process.env.API_ENV_FILE_LOADED_FROM ?? "process.env"} key=${this.maskSecret(apiKey)}`
    );
    this.logger.log(
      `Dev call start payload: companyId=${start.companyId ?? "-"} ` +
        `flowId=${start.flowId ?? "-"} phoneNumberId=${start.phoneNumberId ?? "-"} ` +
        `caller=${start.callerNumber ?? "-"}`
    );
    const url = new URL(req.url ?? "", "http://localhost");
    const companyId = start.companyId ?? url.searchParams.get("companyId");
    if (!companyId) {
      this.logger.warn("Dev call rejected: companyId missing");
      this.sendDevJson(ws, { type: "error", message: "companyId is required" });
      ws.close();
      return;
    }

    const requestedFlowId = start.flowId ?? url.searchParams.get("flowId") ?? null;
    const requestedPhoneNumberId =
      start.phoneNumberId ?? url.searchParams.get("phoneNumberId") ?? null;
    const providerCallId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let flowId = requestedFlowId;
    let phoneNumberId: string | null = null;
    let transferTo: string | undefined;

    if (requestedPhoneNumberId) {
      const pn = await this.prisma.phoneNumber.findFirst({
        where: { id: requestedPhoneNumberId, companyId },
      });
      if (pn) {
        phoneNumberId = pn.id;
        flowId = flowId ?? pn.callFlowId ?? null;
        transferTo = pn.transferTo ?? undefined;
      }
    }

    let compiled = this.compiler.compile(null, null);
    if (flowId) {
      const flow = await this.prisma.callFlow.findFirst({
        where: { id: flowId, companyId },
      });
      if (flow) {
        compiled = this.compiler.compile(flow.flowJson, flow.name);
        this.logger.log(
          `Dev call using flow: id=${flow.id} name="${flow.name}" ` +
            `nodes=${this.countFlowNodes(flow.flowJson)}`
        );
      } else {
        this.logger.warn(
          `Dev call requested flowId=${flowId} but not found for companyId=${companyId} → empty fallback`
        );
        flowId = null;
      }
    } else {
      this.logger.warn(
        `Dev call has no flowId → empty fallback instructions (AI が台本なしで会話)`
      );
    }

    const session = await this.prisma.callSession.create({
      data: {
        companyId,
        phoneNumberId,
        callFlowId: flowId,
        providerCallId,
        callerNumber: start.callerNumber ?? "dev-browser",
        startedAt: new Date(),
      },
      select: { id: true },
    });

    // ⚠️ レース回避: bridge を先に作って message listener を貼ってから
    // "started" を送る。逆順だとクライアントが "started" 受信直後に流す
    // 音声フレームの一部が listener 不在で消滅する。
    const bridge = new RealtimeBridge(
      ws,
      compiled,
      {
        companyId,
        callFlowId: flowId,
        callSessionId: session.id,
        callerNumber: start.callerNumber ?? "dev-browser",
        transferTo,
        faqMinScore: compiled.faqMinScore,
        documentMinScore: compiled.documentMinScore,
      },
      {
        openAiApiKey: apiKey,
        toolExecutor: this.toolExecutor,
        onEvent: (event) => this.sendDevBridgeEvent(ws, event),
        saveTranscript: (data) => this.persistTranscript(data),
        markSessionEnded: (data) => this.markSessionEnded(data),
      }
    );
    this.bridges.add(bridge);
    ws.once("close", () => this.bridges.delete(bridge));

    this.sendDevJson(ws, {
      type: "started",
      callSessionId: session.id,
      providerCallId,
      flowId,
      phoneNumberId,
    });

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

  private waitForDevStart(ws: WebSocket): Promise<DevCallStartMessage> {
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
          this.logger.warn("Dev call sent binary audio before dev_call:start");
          return;
        }

        try {
          const text = typeof raw === "string" ? raw : raw.toString("utf8");
          const message = JSON.parse(text) as Partial<DevCallStartMessage>;
          if (message.event === "dev_call:start") {
            settle(() => resolve(message as DevCallStartMessage));
          }
        } catch (err) {
          this.logger.warn(`Failed to parse initial dev call message: ${(err as Error).message}`);
        }
      };

      const onClose = () => settle(() => reject(new Error("Dev call closed before start event")));
      const onError = (err: Error) => settle(() => reject(err));
      const timer = setTimeout(
        () => settle(() => reject(new Error("Timed out waiting for dev_call:start"))),
        5000
      );

      ws.on("message", onMessage);
      ws.once("close", onClose);
      ws.once("error", onError);
    });
  }

  private sendDevBridgeEvent(ws: WebSocket, event: BridgeObserverEvent) {
    this.sendDevJson(ws, event);
  }

  private sendDevJson(ws: WebSocket, payload: Record<string, unknown>) {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  }

  /** RealtimeBridge から発話確定の度に呼ばれる。CallTranscript として 1 行 INSERT。 */
  private async persistTranscript(data: {
    callSessionId: string;
    speaker: "USER" | "AI";
    content: string;
    timestamp: number;
  }) {
    try {
      await this.prisma.callTranscript.create({
        data: {
          callSessionId: data.callSessionId,
          speaker: data.speaker,
          content: data.content,
          timestamp: data.timestamp,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist transcript for session ${data.callSessionId}: ${(err as Error).message}`
      );
    }
  }

  /** Realtime WS が閉じた時点で終了時刻と秒数を補完する。後続の CPaaS webhook の値は尊重する。 */
  private async markSessionEnded(data: {
    callSessionId: string;
    endedAt: Date;
    durationSeconds: number;
    reason: string;
  }) {
    try {
      const current = await this.prisma.callSession.findUnique({
        where: { id: data.callSessionId },
        select: { endedAt: true, durationSeconds: true },
      });
      if (!current || (current.endedAt && current.durationSeconds != null)) return;

      await this.prisma.callSession.update({
        where: { id: data.callSessionId },
        data: {
          endedAt: current.endedAt ?? data.endedAt,
          durationSeconds: current.durationSeconds ?? data.durationSeconds,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to mark session ended for ${data.callSessionId}: ${(err as Error).message}`
      );
    }
  }

  private maskSecret(value: string) {
    if (value.length <= 12) return "********";
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  }

  /** flow.flowJson の中の nodes 数を安全に数える（型チェックは FlowCompiler 側に任せる） */
  private countFlowNodes(flowJson: unknown): number {
    if (
      flowJson &&
      typeof flowJson === "object" &&
      "nodes" in flowJson &&
      Array.isArray((flowJson as { nodes: unknown }).nodes)
    ) {
      return ((flowJson as { nodes: unknown[] }).nodes as unknown[]).length;
    }
    return 0;
  }
}
