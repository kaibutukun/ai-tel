import { Logger } from "@nestjs/common";
import WebSocket = require("ws");

// ─────────────────────────────────────────────────────────────
// OpenAI Realtime API クライアント（WebSocket ラッパー）
//
// OpenAI Realtime は WebSocket 持続接続で、サーバー側で会話状態を保持する。
// このクライアントは:
//   - 接続管理（reconnect は今はサポートしない）
//   - JSON イベントの送受信
//   - 入出力音声バッファのやり取り
//   - tool call イベントのハンドリング
// を提供する。
//
// 詳細: https://platform.openai.com/docs/api-reference/realtime
// ─────────────────────────────────────────────────────────────

const OPENAI_REALTIME_URL = "wss://api.openai.com/v1/realtime";

// 利用モデル。GA 版の汎用モデル名。env で上書き可能。
const DEFAULT_MODEL = "gpt-realtime";

export interface RealtimeSessionConfig {
  instructions: string;
  tools: unknown[];
  voice?: string;
  /** CPaaS プロバイダの音声形式に合わせる */
  inputAudioFormat?: "g711_ulaw" | "pcm16";
  outputAudioFormat?: "g711_ulaw" | "pcm16";
  turnDetection?: {
    type: "server_vad";
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  };
}

type RealtimeAudioFormat = RealtimeSessionConfig["inputAudioFormat"];

export type OpenAIRealtimeEvent = Record<string, unknown> & { type: string };

export interface OpenAIRealtimeClientEvents {
  open: () => void;
  event: (event: OpenAIRealtimeEvent) => void;
  audioDelta: (audioBase64: string) => void;
  audioDone: () => void;
  /** AI の発話テキスト(transcript)の差分。output_modalities=["audio"] でも届く */
  textDelta: (text: string) => void;
  /** AI 応答の transcript が確定したタイミング(1応答分の完全テキスト) */
  responseTranscriptDone: (transcript: string) => void;
  responseDone: (response: OpenAIRealtimeEvent) => void;
  responseCreated: () => void;
  functionCall: (call: FunctionCallEvent) => void;
  speechStarted: () => void;
  speechStopped: () => void;
  /** お客様発話の書き起こしが確定したタイミング */
  userTranscript: (transcript: string) => void;
  sessionUpdated: () => void;
  error: (err: Error) => void;
  close: (code: number, reason: string) => void;
}

export interface FunctionCallEvent {
  callId: string;
  name: string;
  arguments: string; // JSON string（未完成な場合もある）
}

// イベント名 → リスナー型のマッピング。型レベルでは整合させつつ、
// 内部ストレージは any 配列にして TS の variance 制約を回避する。
type EventName = keyof OpenAIRealtimeClientEvents;
type Listener<T extends EventName> = OpenAIRealtimeClientEvents[T];

export class OpenAIRealtimeClient {
  private readonly logger = new Logger(OpenAIRealtimeClient.name);
  private ws: WebSocket | null = null;
  // 値は (...args: any[]) => void の配列。on/emit の入口で型をかける。
  private readonly listeners = new Map<EventName, Array<(...args: unknown[]) => void>>();

  /** 進行中の function call の引数を accumulate するためのバッファ */
  private functionCallBuffer = new Map<string, { name: string; arguments: string }>();

  /** session.updated を待つための pending */
  private sessionUpdatePending: { resolve: () => void; reject: (e: Error) => void } | null = null;
  /** モデル側で response が現在 active か */
  private responseActive = false;
  /** session.update 適用前に来た入力音声を一時保管するキュー。session.updated で flush。 */
  private pendingInputAudio: string[] = [];
  /** session.updated を受信済みか。これが true になるまで input audio は送らない。 */
  private sessionReady = false;

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.OPENAI_REALTIME_MODEL || DEFAULT_MODEL
  ) {}

  on<K extends EventName>(event: K, listener: Listener<K>) {
    const arr = this.listeners.get(event) ?? [];
    arr.push(listener as unknown as (...args: unknown[]) => void);
    this.listeners.set(event, arr);
  }

  private emit<K extends EventName>(event: K, ...args: Parameters<Listener<K>>) {
    const arr = this.listeners.get(event);
    if (!arr) return;
    for (const listener of arr) {
      try {
        listener(...(args as unknown[]));
      } catch (err) {
        this.logger.error(`Listener for ${String(event)} threw: ${(err as Error).message}`);
      }
    }
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${OPENAI_REALTIME_URL}?model=${encodeURIComponent(this.model)}`;
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      this.ws.on("open", () => {
        this.emit("open");
        resolve();
      });

      this.ws.on("message", (data) => {
        try {
          const text = typeof data === "string" ? data : data.toString("utf8");
          const event = JSON.parse(text) as OpenAIRealtimeEvent;
          this.handleEvent(event);
        } catch (err) {
          this.logger.warn(`Failed to parse OpenAI event: ${(err as Error).message}`);
        }
      });

      this.ws.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.ws.on("close", (code, reason) => {
        this.emit("close", code, reason.toString());
      });
    });
  }

  /**
   * セッション設定。接続後すぐ呼ぶ。
   * session.updated を受信するまで await できる Promise を返す。
   * これを await してから response.create を打たないと、デフォルトセッション
   * (instructions/tools 無し) で応答が始まる可能性がある。
   */
  updateSession(config: RealtimeSessionConfig): Promise<void> {
    // 前回の pending があれば破棄(通常は無いが安全のため)
    if (this.sessionUpdatePending) {
      this.sessionUpdatePending.reject(new Error("superseded by new session.update"));
      this.sessionUpdatePending = null;
    }

    const promise = new Promise<void>((resolve, reject) => {
      this.sessionUpdatePending = { resolve, reject };
      // 5秒で fail-safe (タイムアウトしても resolve はせず reject)
      setTimeout(() => {
        if (this.sessionUpdatePending) {
          const pending = this.sessionUpdatePending;
          this.sessionUpdatePending = null;
          pending.reject(new Error("session.updated timeout"));
        }
      }, 5000);
    });

    this.send({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: config.instructions,
        audio: {
          input: {
            format: this.toGaAudioFormat(config.inputAudioFormat ?? "g711_ulaw"),
            transcription: { model: "gpt-4o-mini-transcribe" },
            // server VAD: モデル側で発話区間検出と割り込みを行う
            turn_detection: {
              type: config.turnDetection?.type ?? "server_vad",
              threshold: config.turnDetection?.threshold ?? 0.5,
              prefix_padding_ms: config.turnDetection?.prefixPaddingMs ?? 300,
              silence_duration_ms: config.turnDetection?.silenceDurationMs ?? 500,
            },
          },
          output: {
            format: this.toGaAudioFormat(config.outputAudioFormat ?? "g711_ulaw"),
            voice: config.voice ?? "alloy",
          },
        },
        output_modalities: ["audio"],
        tools: config.tools,
        tool_choice: "auto",
      },
    });

    return promise;
  }

  /** 現在 response が active かどうか(speechStarted で cancel すべきかの判定用) */
  isResponseActive() {
    return this.responseActive;
  }

  /** CPaaS 経由のお客様音声を投入。session.update 前に来た分はキューに溜めて後で flush。 */
  appendInputAudio(base64Audio: string) {
    if (!this.sessionReady) {
      // 上限を設けてメモリ暴走を防ぐ (24kHz/20ms フレームで 1000 個 ≈ 20 秒分)
      this.pendingInputAudio.push(base64Audio);
      if (this.pendingInputAudio.length > 1000) {
        this.pendingInputAudio.shift();
      }
      return;
    }
    this.send({
      type: "input_audio_buffer.append",
      audio: base64Audio,
    });
  }

  /** 開幕の固定発話を assistant メッセージとして注入し、即座に発話させる */
  injectAssistantUtterance(text: string) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    });
    // 注入したメッセージを音声化して再生
    this.send({
      type: "response.create",
      response: { output_modalities: ["audio"] },
    });
  }

  /** ツール呼び出しの結果をモデルに返し、続きの応答を促す */
  sendFunctionResult(callId: string, output: unknown) {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
    this.send({
      type: "response.create",
      response: { output_modalities: ["audio"] },
    });
  }

  /** ユーザー発話の割り込み発生時、進行中の応答をキャンセル */
  cancelResponse() {
    if (!this.responseActive) return;
    this.send({ type: "response.cancel" });
  }

  close() {
    this.sessionReady = false;
    this.pendingInputAudio = [];
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
  }

  // ────────────────────────────────────────────
  // 内部: イベントディスパッチ
  // ────────────────────────────────────────────

  private handleEvent(event: OpenAIRealtimeEvent) {
    this.emit("event", event);

    switch (event.type) {
      case "response.output_audio.delta":
      case "response.audio.delta": {
        const audio = event.delta as string | undefined;
        if (audio) this.emit("audioDelta", audio);
        break;
      }
      case "response.output_audio.done":
      case "response.audio.done":
        this.emit("audioDone");
        break;
      case "response.text.delta":
      case "response.output_text.delta":
      // GA gpt-realtime で audio-only モダリティ時に AI 発話テキストが届くイベント
      case "response.output_audio_transcript.delta":
      case "response.audio_transcript.delta": {
        const text = (event.delta as string | undefined) ?? "";
        if (text) this.emit("textDelta", text);
        break;
      }
      case "response.created":
        this.responseActive = true;
        this.emit("responseCreated");
        break;
      case "response.done":
      case "response.cancelled":
        this.responseActive = false;
        this.emit("responseDone", event);
        break;
      case "session.updated": {
        this.sessionReady = true;
        // session 適用前に届いた入力音声を、正しいフォーマット設定下で OpenAI に流す
        const flushed = this.pendingInputAudio.splice(0);
        if (flushed.length > 0) {
          this.logger.log(
            `Flushing ${flushed.length} buffered input audio chunks after session.updated`
          );
          for (const audio of flushed) {
            this.send({ type: "input_audio_buffer.append", audio });
          }
        }
        const pending = this.sessionUpdatePending;
        if (pending) {
          this.sessionUpdatePending = null;
          pending.resolve();
        }
        this.emit("sessionUpdated");
        break;
      }
      case "input_audio_buffer.speech_started":
        // ユーザーが喋り始めた → 呼び出し側で再生中音声をクリアする
        this.emit("speechStarted");
        break;
      case "input_audio_buffer.speech_stopped":
        this.emit("speechStopped");
        break;
      case "conversation.item.input_audio_transcription.completed": {
        const transcript = (event.transcript as string | undefined) ?? "";
        if (transcript) this.emit("userTranscript", transcript);
        break;
      }
      case "conversation.item.input_audio_transcription.failed": {
        const err =
          ((event.error as Record<string, unknown> | undefined)?.message as string | undefined) ||
          "input audio transcription failed";
        this.logger.warn(`user transcription failed: ${err}`);
        break;
      }
      case "response.output_audio_transcript.done":
      case "response.audio_transcript.done": {
        const transcript = (event.transcript as string | undefined) ?? "";
        if (transcript) this.emit("responseTranscriptDone", transcript);
        break;
      }
      case "response.function_call_arguments.delta": {
        const callId = event.call_id as string;
        const name = (event.name as string | undefined) ?? "";
        const delta = (event.delta as string | undefined) ?? "";
        const buf = this.functionCallBuffer.get(callId) ?? { name, arguments: "" };
        buf.arguments += delta;
        if (name) buf.name = name;
        this.functionCallBuffer.set(callId, buf);
        break;
      }
      case "response.function_call_arguments.done": {
        const callId = event.call_id as string;
        const fallback = this.functionCallBuffer.get(callId);
        const name = (event.name as string | undefined) ?? fallback?.name ?? "";
        const args = (event.arguments as string | undefined) ?? fallback?.arguments ?? "{}";
        this.functionCallBuffer.delete(callId);
        this.emit("functionCall", { callId, name, arguments: args });
        break;
      }
      case "error": {
        const errObj = event.error as Record<string, unknown> | undefined;
        const code = errObj?.code as string | undefined;
        const message = (errObj?.message as string | undefined) || "OpenAI Realtime error";

        // 「もう active じゃない response への cancel」は無害(turn_detection で既に
        // 自動キャンセル済み等)。エラーログを汚すだけなので静かに飲み込む。
        if (code === "response_cancel_not_active") {
          this.logger.debug(`Ignored cancel race: ${message}`);
          break;
        }

        // OpenAI からのエラーは原因究明のために全体を残す。
        try {
          this.logger.error(`OpenAI error event payload: ${JSON.stringify(event)}`);
        } catch {
          this.logger.error("OpenAI error event payload (unserializable)");
        }
        this.emit("error", new Error(message));
        break;
      }
      default:
        // 他のイベントは "event" リスナーで参照可能
        break;
    }
  }

  private send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(`Tried to send ${payload.type} while WS not open`);
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  private toGaAudioFormat(format: RealtimeAudioFormat) {
    if (format === "pcm16") return { type: "audio/pcm", rate: 24000 };
    return { type: "audio/pcmu" };
  }
}
