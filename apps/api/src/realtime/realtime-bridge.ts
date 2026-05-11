import { Logger } from "@nestjs/common";
import WebSocket from "ws";
import { OpenAIRealtimeClient } from "./openai-realtime-client";
import {
  TwilioInboundMessage,
  TwilioMediaOutbound,
  TwilioOutboundMessage,
  TwilioStartMessage,
} from "./twilio-stream.types";
import { CompiledFlow } from "../call-flows/flow-compiler.service";
import { ToolContext, ToolExecutorService } from "./tool-executor.service";

// ─────────────────────────────────────────────────────────────
// RealtimeBridge
//
// 1通話＝1インスタンス。
// 「Twilio Media Stream (WebSocket)」と「OpenAI Realtime (WebSocket)」の
// 双方向 pipe を担当する。
//
//   お客様音声 ── Twilio ──► このサーバー ──► OpenAI Realtime
//                                             │
//                                             ▼  音声/テキスト/tool call
//   再生音声  ◄── Twilio ◄── このサーバー ◄── OpenAI Realtime
//
// 音声は g711 µ-law / base64 / 8kHz を両側で揃えているので無変換でリレー。
// ─────────────────────────────────────────────────────────────

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
  /** 通話中に転送が必要になった時に Twilio REST で実際の dial 変更を行うフック（後で実装） */
  onTransferRequested?: (callSid: string, to: string) => Promise<void> | void;
}

export class RealtimeBridge {
  private readonly logger = new Logger(RealtimeBridge.name);
  private streamSid: string | null = null;
  private callSid: string | null = null;
  private openai: OpenAIRealtimeClient | null = null;
  private closed = false;

  constructor(
    private readonly twilioWs: WebSocket,
    private readonly compiled: CompiledFlow,
    private readonly context: BridgeContext,
    private readonly deps: BridgeDeps
  ) {
    this.attachTwilioListeners();
  }

  // ────────────────────────────────────────────
  // Twilio 側ハンドリング
  // ────────────────────────────────────────────

  private attachTwilioListeners() {
    this.twilioWs.on("message", async (raw) => {
      try {
        const text = typeof raw === "string" ? raw : raw.toString("utf8");
        const msg = JSON.parse(text) as TwilioInboundMessage;
        await this.handleTwilioMessage(msg);
      } catch (err) {
        this.logger.warn(`Failed to parse Twilio message: ${(err as Error).message}`);
      }
    });
    this.twilioWs.on("close", () => this.shutdown("twilio_closed"));
    this.twilioWs.on("error", (err) => {
      this.logger.error(`Twilio WS error: ${err.message}`);
      this.shutdown("twilio_error");
    });
  }

  private async handleTwilioMessage(msg: TwilioInboundMessage) {
    switch (msg.event) {
      case "connected":
        // Twilio から最初に来るハンドシェイク。中身は無視で OK。
        break;
      case "start":
        await this.onStreamStart(msg);
        break;
      case "media":
        // 受信音声を OpenAI へリレー
        if (msg.media.track === "inbound") {
          this.openai?.appendInputAudio(msg.media.payload);
        }
        break;
      case "stop":
        this.shutdown("twilio_stop");
        break;
      case "dtmf":
        // 今は無視（将来: 「9 を押すとオペレーター」等のショートカットに使う）
        break;
      default:
        break;
    }
  }

  private async onStreamStart(msg: TwilioStartMessage) {
    this.streamSid = msg.streamSid;
    this.callSid = msg.start.callSid;
    this.logger.log(`stream start callSid=${this.callSid} streamSid=${this.streamSid}`);

    // OpenAI Realtime 接続
    try {
      this.openai = new OpenAIRealtimeClient(this.deps.openAiApiKey);
      this.attachOpenAiListeners(this.openai);
      await this.openai.connect();
      this.openai.updateSession({
        instructions: this.compiled.instructions,
        tools: this.compiled.tools,
        // Twilio から来るのも g711_ulaw、Twilio へ送るのも g711_ulaw。
        inputAudioFormat: "g711_ulaw",
        outputAudioFormat: "g711_ulaw",
        // 声色は env で差し替え可能（OpenAI が用意してる代表声）
        voice: process.env.OPENAI_REALTIME_VOICE || "alloy",
      });

      // 開幕の固定発話があるなら即座に喋らせる
      if (this.compiled.openingLockedMessage) {
        this.openai.injectAssistantUtterance(this.compiled.openingLockedMessage);
      } else {
        // 固定発話が無いケースでは LLM 自身に最初の発話を作らせる
        this.openai.injectAssistantUtterance("お電話ありがとうございます。");
      }
    } catch (err) {
      this.logger.error(`Failed to start OpenAI session: ${(err as Error).message}`);
      this.shutdown("openai_connect_failed");
    }
  }

  // ────────────────────────────────────────────
  // OpenAI 側ハンドリング
  // ────────────────────────────────────────────

  private attachOpenAiListeners(client: OpenAIRealtimeClient) {
    client.on("audioDelta", (audio) => this.sendTwilioAudio(audio));

    client.on("speechStarted", () => {
      // ユーザーが割り込んだ → Twilio 側の再生キューを破棄して被らないようにする
      this.sendTwilio({ event: "clear", streamSid: this.streamSid ?? "" });
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
      // モデルにツール結果を返す（続きの発話を促す）
      client.sendFunctionResult(call.callId, result.output);

      // 通話側の副作用処理
      if (result.sideEffect?.kind === "transfer" && this.callSid) {
        try {
          await this.deps.onTransferRequested?.(this.callSid, result.sideEffect.to);
        } catch (err) {
          this.logger.error(`Transfer failed: ${(err as Error).message}`);
        }
      } else if (result.sideEffect?.kind === "end_call") {
        // モデルの発話完了を待ってから切るのが理想だが、まずはシンプルに少し遅延
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

  // ────────────────────────────────────────────
  // Twilio 送信ヘルパ
  // ────────────────────────────────────────────

  private sendTwilioAudio(audioBase64: string) {
    if (!this.streamSid) return;
    const payload: TwilioMediaOutbound = {
      event: "media",
      streamSid: this.streamSid,
      media: { payload: audioBase64 },
    };
    this.sendTwilio(payload);
  }

  private sendTwilio(payload: TwilioOutboundMessage) {
    if (this.twilioWs.readyState !== WebSocket.OPEN) return;
    this.twilioWs.send(JSON.stringify(payload));
  }

  // ────────────────────────────────────────────
  // 後片付け
  // ────────────────────────────────────────────

  shutdown(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.logger.log(`shutdown reason=${reason} callSid=${this.callSid}`);
    try {
      this.openai?.close();
    } catch {
      /* noop */
    }
    try {
      if (this.twilioWs.readyState === WebSocket.OPEN) this.twilioWs.close();
    } catch {
      /* noop */
    }
  }
}
