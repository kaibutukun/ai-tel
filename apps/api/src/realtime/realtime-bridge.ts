import { Logger } from "@nestjs/common";
import WebSocket = require("ws");
import { OpenAIRealtimeClient } from "./openai-realtime-client";
import { NttCpaasDtmfMessage } from "./ntt-cpaas-stream.types";
import { CompiledFlow } from "../call-flows/flow-compiler.service";
import { ToolContext, ToolExecutorService } from "./tool-executor.service";

const NTT_CPAAS_SAMPLE_RATE = 24000;
const NTT_CPAAS_FRAME_BYTES = 960; // 24kHz * 20ms * 16-bit mono

export interface BridgeContext {
  companyId: string;
  callFlowId: string | null;
  callSessionId: string | null;
  callerNumber?: string;
  transferTo?: string;
  notifyTarget?: string;
  /** rag ノードに設定された精度。FlowCompiler が解決した値が入る。 */
  ragPrecision: number;
}

export interface BridgeDeps {
  openAiApiKey: string;
  toolExecutor: ToolExecutorService;
  /** 通話中に転送が必要になった時に CPaaS API で実際の転送を行うフック（後で実装） */
  onTransferRequested?: (providerCallId: string, to: string) => Promise<void> | void;
}

export class RealtimeBridge {
  private readonly logger = new Logger(RealtimeBridge.name);
  private providerCallId: string | null = null;
  private openai: OpenAIRealtimeClient | null = null;
  private closed = false;
  private outputBuffer = Buffer.alloc(0);

  constructor(
    private readonly cpaasWs: WebSocket,
    private readonly compiled: CompiledFlow,
    private readonly context: BridgeContext,
    private readonly deps: BridgeDeps
  ) {
    this.attachCpaasListeners();
  }

  async start(providerCallId?: string) {
    this.providerCallId = providerCallId ?? null;
    this.logger.log(`NTT CPaaS stream start callId=${this.providerCallId ?? "-"}`);

    try {
      this.openai = new OpenAIRealtimeClient(this.deps.openAiApiKey);
      this.attachOpenAiListeners(this.openai);
      await this.openai.connect();
      this.openai.updateSession({
        instructions: this.compiled.instructions,
        tools: this.compiled.tools,
        inputAudioFormat: "pcm16",
        outputAudioFormat: "pcm16",
        voice: process.env.OPENAI_REALTIME_VOICE || "alloy",
      });

      if (this.compiled.openingLockedMessage) {
        this.openai.injectAssistantUtterance(this.compiled.openingLockedMessage);
      } else {
        this.openai.injectAssistantUtterance("お電話ありがとうございます。");
      }
    } catch (err) {
      this.logger.error(`Failed to start OpenAI session: ${(err as Error).message}`);
      this.shutdown("openai_connect_failed");
    }
  }

  private attachCpaasListeners() {
    this.cpaasWs.on("message", async (raw, isBinary) => {
      try {
        if (isBinary) {
          this.handleInputAudio(this.toBuffer(raw));
          return;
        }

        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const msg = JSON.parse(text) as NttCpaasDtmfMessage;
        if (msg.event === "websocket:dtmf") {
          // 今は無視（将来: 「9 を押すとオペレーター」等のショートカットに使う）
        }
      } catch (err) {
        this.logger.warn(`Failed to handle NTT CPaaS message: ${(err as Error).message}`);
      }
    });
    this.cpaasWs.on("close", () => this.shutdown("cpaas_closed"));
    this.cpaasWs.on("error", (err) => {
      this.logger.error(`NTT CPaaS WS error: ${err.message}`);
      this.shutdown("cpaas_error");
    });
  }

  private handleInputAudio(audio: Buffer) {
    if (audio.length === 0) return;
    this.openai?.appendInputAudio(audio.toString("base64"));
  }

  private attachOpenAiListeners(client: OpenAIRealtimeClient) {
    client.on("audioDelta", (audio) => this.sendCpaasAudio(audio));

    client.on("speechStarted", () => {
      // NTT CPaaS WebSocket endpoint には再生バッファ clear 相当がないため、
      // こちら側の未送信フレームだけ破棄し、OpenAI の応答生成を止める。
      this.outputBuffer = Buffer.alloc(0);
      client.cancelResponse();
    });

    client.on("functionCall", async (call) => {
      const ctx: ToolContext = {
        companyId: this.context.companyId,
        callSessionId: this.context.callSessionId,
        callFlowId: this.context.callFlowId,
        callerNumber: this.context.callerNumber,
        defaults: {
          transferTo: this.context.transferTo,
          notifyTarget: this.context.notifyTarget,
        },
        ragPrecision: this.context.ragPrecision,
      };
      const result = await this.deps.toolExecutor.execute(
        { callId: call.callId, name: call.name, arguments: call.arguments },
        ctx
      );
      client.sendFunctionResult(call.callId, result.output);

      if (result.sideEffect?.kind === "transfer" && this.providerCallId) {
        try {
          await this.deps.onTransferRequested?.(this.providerCallId, result.sideEffect.to);
        } catch (err) {
          this.logger.error(`Transfer failed: ${(err as Error).message}`);
        }
      } else if (result.sideEffect?.kind === "end_call") {
        setTimeout(() => this.shutdown("model_end_call"), 1500);
      }
    });

    client.on("error", (err) => {
      this.logger.error(`OpenAI error: ${err.message}`);
    });

    client.on("close", (code, reason) => {
      this.logger.log(`OpenAI WS closed code=${code} reason=${reason}`);
      this.shutdown("openai_closed");
    });
  }

  private sendCpaasAudio(audioBase64: string) {
    const chunk = Buffer.from(audioBase64, "base64");
    if (chunk.length === 0) return;

    this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);
    while (this.outputBuffer.length >= NTT_CPAAS_FRAME_BYTES) {
      const frame = this.outputBuffer.subarray(0, NTT_CPAAS_FRAME_BYTES);
      this.outputBuffer = this.outputBuffer.subarray(NTT_CPAAS_FRAME_BYTES);
      this.sendCpaas(frame);
    }
  }

  private sendCpaas(frame: Buffer) {
    if (this.cpaasWs.readyState !== WebSocket.OPEN) return;
    this.cpaasWs.send(frame, { binary: true });
  }

  private toBuffer(raw: WebSocket.RawData) {
    if (Buffer.isBuffer(raw)) return raw;
    if (raw instanceof ArrayBuffer) return Buffer.from(raw);
    return Buffer.concat(raw);
  }

  shutdown(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.logger.log(`shutdown reason=${reason} callId=${this.providerCallId ?? "-"}`);
    try {
      this.openai?.close();
    } catch {
      /* noop */
    }
    try {
      if (this.cpaasWs.readyState === WebSocket.OPEN) this.cpaasWs.close();
    } catch {
      /* noop */
    }
  }
}

export const NTT_CPAAS_REALTIME_AUDIO = {
  sampleRate: NTT_CPAAS_SAMPLE_RATE,
  frameBytes: NTT_CPAAS_FRAME_BYTES,
};
