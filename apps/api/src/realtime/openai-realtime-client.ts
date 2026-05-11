import { Logger } from "@nestjs/common";
import WebSocket from "ws";

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
  /** Twilio の g711_ulaw を直接やり取りするので形式は固定 */
  inputAudioFormat?: "g711_ulaw" | "pcm16";
  outputAudioFormat?: "g711_ulaw" | "pcm16";
  turnDetection?: {
    type: "server_vad";
    threshold?: number;
    prefixPaddingMs?: number;
    silenceDurationMs?: number;
  };
}

export type OpenAIRealtimeEvent = Record<string, unknown> & { type: string };

export interface OpenAIRealtimeClientEvents {
  open: () => void;
  event: (event: OpenAIRealtimeEvent) => void;
  audioDelta: (audioBase64: string) => void;
  audioDone: () => void;
  textDelta: (text: string) => void;
  responseDone: (response: OpenAIRealtimeEvent) => void;
  functionCall: (call: FunctionCallEvent) => void;
  speechStarted: () => void;
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
      // OpenAI-Beta ヘッダは GA 後も明示しておくと安全
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
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

  /** セッション設定。接続後すぐ呼ぶ */
  updateSession(config: RealtimeSessionConfig) {
    this.send({
      type: "session.update",
      session: {
        instructions: config.instructions,
        voice: config.voice ?? "alloy",
        input_audio_format: config.inputAudioFormat ?? "g711_ulaw",
        output_audio_format: config.outputAudioFormat ?? "g711_ulaw",
        // server VAD: モデル側で発話区間検出と割り込みを行う
        turn_detection: {
          type: config.turnDetection?.type ?? "server_vad",
          threshold: config.turnDetection?.threshold ?? 0.5,
          prefix_padding_ms: config.turnDetection?.prefixPaddingMs ?? 300,
          silence_duration_ms: config.turnDetection?.silenceDurationMs ?? 500,
        },
        // 音声＋テキスト両方をモデルが扱える状態にする（ログ取り用）
        modalities: ["audio", "text"],
        tools: config.tools,
        tool_choice: "auto",
        // 文字起こし（後で会話ログ保存に使える）
        input_audio_transcription: { model: "whisper-1" },
      },
    });
  }

  /** Twilio 経由のお客様音声を投入 */
  appendInputAudio(base64Audio: string) {
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
        content: [{ type: "text", text }],
      },
    });
    // 注入したメッセージを音声化して再生
    this.send({
      type: "response.create",
      response: { modalities: ["audio", "text"] },
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
      response: { modalities: ["audio", "text"] },
    });
  }

  /** ユーザー発話の割り込み発生時、進行中の応答をキャンセル */
  cancelResponse() {
    this.send({ type: "response.cancel" });
  }

  close() {
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
      case "response.audio.delta": {
        const audio = event.delta as string | undefined;
        if (audio) this.emit("audioDelta", audio);
        break;
      }
      case "response.audio.done":
        this.emit("audioDone");
        break;
      case "response.text.delta":
      case "response.output_text.delta": {
        const text = (event.delta as string | undefined) ?? "";
        if (text) this.emit("textDelta", text);
        break;
      }
      case "response.done":
        this.emit("responseDone", event);
        break;
      case "input_audio_buffer.speech_started":
        // ユーザーが喋り始めた → 呼び出し側で再生中音声をクリアする
        this.emit("speechStarted");
        break;
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
        const message =
          ((event.error as Record<string, unknown> | undefined)?.message as string | undefined) ||
          "OpenAI Realtime error";
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
}
