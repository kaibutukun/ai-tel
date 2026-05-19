import { Logger } from "@nestjs/common";
import WebSocket = require("ws");
import { OpenAIRealtimeClient } from "./openai-realtime-client";
import { NttCpaasDtmfMessage } from "./ntt-cpaas-stream.types";
import { CompiledFlow } from "../call-flows/flow-compiler.service";
import { ToolContext, ToolExecutionResult, ToolExecutorService } from "./tool-executor.service";
import {
  CpaasAudioFramer,
  NTT_CPAAS_FRAME_BYTES,
  NTT_CPAAS_SAMPLE_RATE,
  Pcm16BargeInDetector,
  RealtimeSessionClock,
  logToolNodeEntry,
  logToolNodeResult,
  summarizeForLog,
} from "./core/realtime-bridge-support";

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
  /** 開発用テスターなど、通話の内部イベントを画面へ流したい呼び出し元向け */
  onEvent?: (event: BridgeObserverEvent) => void;
  /**
   * USER/AI の発話が確定したタイミングで CallTranscript として永続化するフック。
   * 通話ログ詳細ページから後で参照できるようにするため、bridge 内では DB に直接
   * 触らず callback で受け取って呼び出し側 (RealtimeService) が prisma を介して書く。
   */
  saveTranscript?: (data: {
    callSessionId: string;
    speaker: "USER" | "AI";
    content: string;
    timestamp: number;
  }) => Promise<void> | void;
  /** WebSocket が閉じたタイミングで CallSession の終了時刻/通話秒数を補完する。 */
  markSessionEnded?: (data: {
    callSessionId: string;
    endedAt: Date;
    durationSeconds: number;
    reason: string;
  }) => Promise<void> | void;
}

export type BridgeObserverEvent =
  | { type: "text_delta"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "assistant_transcript_done"; text: string }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      output: ToolExecutionResult["output"];
      sideEffect?: ToolExecutionResult["sideEffect"];
    }
  | { type: "error"; message: string }
  | { type: "ended"; reason: string };

export class RealtimeBridge {
  private readonly logger = new Logger(RealtimeBridge.name);
  private providerCallId: string | null = null;
  private openai: OpenAIRealtimeClient | null = null;
  private closed = false;
  private readonly audioFramer = new CpaasAudioFramer();
  private readonly bargeInDetector = new Pcm16BargeInDetector();
  private readonly sessionClock = new RealtimeSessionClock();
  /** AI の応答テキストを 1 ターン分バッファして response.done で吐く */
  private assistantTextBuffer = "";
  /** 入力音声の流量モニタ用カウンタ(直近 3 秒の合計サンプル/バイト数) */
  private inputAudioBytes = 0;
  private inputAudioLogTimer: NodeJS.Timeout | null = null;
  /**
   * AI が最後に音声フレームを出した時刻(epoch ms)。エコーガード判定に使う。
   * dev でブラウザのスピーカー→マイクのフィードバックで AI が自分の声を
   * "ユーザー発話" として聞いてしまう (response.done → 無限ループ) のを防ぐため、
   * AI 発話中およびその直後 echoGuardMs ms は入力音声を OpenAI に送らない。
   * ただしこれを有効にするとユーザー割り込み検出も遅れるため、既定値は 0。
   * ブラウザ dev でスピーカー→マイクの回り込みが強い場合だけ env で有効化する。
   */
  private lastAssistantAudioAt = 0;
  private readonly echoGuardMs = (() => {
    const raw = process.env.REALTIME_ECHO_GUARD_MS;
    const n = raw === undefined ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();
  private echoGuardDropCount = 0;
  private userBargeInUntil = 0;

  constructor(
    private readonly cpaasWs: WebSocket,
    private readonly compiled: CompiledFlow,
    private readonly context: BridgeContext,
    private readonly deps: BridgeDeps
  ) {
    this.attachCpaasListeners();
  }

  /** ログ行頭につけるタグ。grep しやすいように callId を埋める */
  private get tag(): string {
    return `[${this.providerCallId ?? "no-callid"}]`;
  }

  async start(providerCallId?: string) {
    this.providerCallId = providerCallId ?? null;
    this.sessionClock.restart();
    this.logger.log(
      `${this.tag} ▶ session start ` +
        `companyId=${this.context.companyId} ` +
        `flowId=${this.context.callFlowId ?? "-"} ` +
        `callSessionId=${this.context.callSessionId ?? "-"} ` +
        `caller=${this.context.callerNumber ?? "-"}`
    );
    this.logger.log(
      `${this.tag} compiled flow: instructions=${this.compiled.instructions.length}chars ` +
        `tools=[${this.compiled.tools.map((t) => t.name).join(", ")}] ` +
        `opening=${this.compiled.openingLockedMessage ? "locked" : "default"} ` +
        `ragPrecision=${this.context.ragPrecision} ` +
        `echoGuard=${this.echoGuardMs}ms`
    );
    // フローの中身が空でAIが意味不明になるケース対策に、頭だけ確認できるよう先頭 240 文字を出す
    this.logger.debug(
      `${this.tag} instructions(head): ${this.compiled.instructions.slice(0, 240).replace(/\s+/g, " ")}`
    );

    try {
      this.openai = new OpenAIRealtimeClient(this.deps.openAiApiKey);
      this.attachOpenAiListeners(this.openai);
      await this.openai.connect();
      if (this.closed) return; // connect 中に CPaaS が切れたケース
      this.logger.log(`${this.tag} OpenAI WS connected`);

      // session.update を打って、適用完了 (session.updated) を待つ。
      // 待たずに response.create を発火すると、instructions/tools 未設定の
      // デフォルトセッションで応答が始まり「フローを理解していない AI」になる。
      const voice = process.env.OPENAI_REALTIME_VOICE || "alloy";
      try {
        await this.openai.updateSession({
          instructions: this.compiled.instructions,
          tools: this.compiled.tools,
          inputAudioFormat: "pcm16",
          outputAudioFormat: "pcm16",
          voice,
        });
        if (this.closed) return;
        this.logger.log(`${this.tag} session.updated ack received (voice=${voice})`);
      } catch (err) {
        // session.updated が来なかった場合でも続行する(タイムアウトはログのみ)。
        // OpenAI 側のイベント名違いで取り損ねている可能性もあるため。
        this.logger.warn(`${this.tag} session.update ack timeout/error: ${(err as Error).message}`);
        if (this.closed) return;
      }

      const opening =
        this.compiled.openingLockedMessage ?? "お電話ありがとうございます。";
      this.logger.log(`${this.tag} 🤖 OPENING: ${opening}`);
      this.openai.injectAssistantUtterance(opening);

      this.startInputAudioMonitor();
    } catch (err) {
      this.logger.error(`${this.tag} Failed to start OpenAI session: ${(err as Error).message}`);
      this.shutdown("openai_connect_failed");
    }
  }

  /** 3 秒ごとに「お客様マイクからの入力音声が流れているか」を要約ログに出す */
  private startInputAudioMonitor() {
    if (this.inputAudioLogTimer) return;
    this.inputAudioLogTimer = setInterval(() => {
      if (this.closed) return;
      const kbps = ((this.inputAudioBytes * 8) / 1000 / 3).toFixed(1);
      const echoDrop = this.echoGuardDropCount;
      const suffix = echoDrop > 0 ? ` echoGuardDrops=${echoDrop}` : "";
      if (this.inputAudioBytes === 0) {
        this.logger.warn(`${this.tag} ⚠ 入力音声が直近3秒で 0 バイト (マイク無音 or 経路断)`);
      } else {
        this.logger.debug(
          `${this.tag} input audio: ${this.inputAudioBytes} bytes / 3s (≈${kbps} kbps)${suffix}`
        );
      }
      this.inputAudioBytes = 0;
      this.echoGuardDropCount = 0;
    }, 3000);
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
    this.inputAudioBytes += audio.length;

    const client = this.openai;
    if (client && this.bargeInDetector.shouldInterrupt(audio, client.isResponseActive())) {
      this.userBargeInUntil = Date.now() + 1200;
      this.cancelActiveResponse(client, "local audio barge-in");
    }

    // エコーガード: AI が今しゃべってる(または直前まで喋ってた)間の入力は捨てる。
    // ただし直近でユーザー割り込みと判定した場合は、続きの発話を捨てない。
    if (
      this.echoGuardMs > 0 &&
      this.lastAssistantAudioAt > 0 &&
      Date.now() - this.lastAssistantAudioAt < this.echoGuardMs &&
      Date.now() > this.userBargeInUntil
    ) {
      this.echoGuardDropCount += 1;
      return;
    }

    this.openai?.appendInputAudio(audio.toString("base64"));
  }

  private attachOpenAiListeners(client: OpenAIRealtimeClient) {
    client.on("audioDelta", (audio) => {
      // 「AI が今喋ってる」マーク。echoGuard 期間中はマイク入力をドロップする。
      this.lastAssistantAudioAt = Date.now();
      this.sendCpaasAudio(audio);
    });

    client.on("textDelta", (text) => {
      this.assistantTextBuffer += text;
      this.emitObserverEvent({ type: "text_delta", text });
    });

    client.on("responseCreated", () => {
      this.assistantTextBuffer = "";
      this.logger.log(`${this.tag} ▷ response.created (AI 応答生成開始)`);
    });

    client.on("responseTranscriptDone", (transcript) => {
      // transcript 確定イベントが先に来る場合もあるので、ここで AI の完全発話を残す
      this.logger.log(`${this.tag} 🤖 AI: ${transcript}`);
      this.emitObserverEvent({ type: "assistant_transcript_done", text: transcript });
      void this.persistTranscript("AI", transcript);
    });

    client.on("responseDone", (event) => {
      const r = (event as { response?: Record<string, unknown> }).response;
      const status = (r?.status as string | undefined) ?? "-";
      const usage = r?.usage ? JSON.stringify(r.usage) : "-";
      const statusDetails = r?.status_details
        ? JSON.stringify(r.status_details)
        : null;
      // transcript.done が来ない経路用のフォールバック(buffer に何か入っていれば出す)
      if (this.assistantTextBuffer.trim()) {
        this.logger.log(
          `${this.tag} 🤖 AI(buffered): ${this.assistantTextBuffer.trim()}`
        );
      }
      this.assistantTextBuffer = "";
      this.logger.log(
        `${this.tag} ◁ response.done status=${status} usage=${usage}` +
          (statusDetails ? ` details=${statusDetails}` : "")
      );
      // モデルが応答を打ち切られた/失敗したケースは目立つように warn
      if (status && status !== "completed") {
        this.logger.warn(
          `${this.tag} ⚠ response.status=${status} → 応答が完了していない可能性`
        );
      }
    });

    client.on("userTranscript", (transcript) => {
      this.logger.log(`${this.tag} 👤 USER: ${transcript}`);
      this.emitObserverEvent({ type: "user_transcript", text: transcript });
      void this.persistTranscript("USER", transcript);
    });

    client.on("speechStarted", () => {
      this.logger.debug(`${this.tag} ▷ user speech_started (割り込み判定)`);
      // NTT CPaaS WebSocket endpoint には再生バッファ clear 相当がないため、
      // こちら側の未送信フレームだけ破棄し、OpenAI の応答生成中ならキャンセル。
      // (response active でない時の response.cancel は OpenAI 側でエラーになる)
      this.userBargeInUntil = Date.now() + 1200;
      this.cancelActiveResponse(client, "OpenAI speech_started");
    });

    client.on("speechStopped", () => {
      this.logger.debug(`${this.tag} ◁ user speech_stopped`);
    });

    client.on("sessionUpdated", () => {
      this.logger.debug(`${this.tag} session.updated event received`);
    });

    client.on("functionCall", async (call) => {
      const parsedArgs = this.safeParseJson(call.arguments);
      this.logNodeEntry(call.name, parsedArgs);
      this.logger.debug(
        `${this.tag} 🛠 TOOL call raw: ${call.name} args=${call.arguments || "{}"}`
      );
      this.emitObserverEvent({
        type: "function_call",
        callId: call.callId,
        name: call.name,
        arguments: call.arguments,
      });
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
        collectRequirements: this.compiled.collectRequirements,
      };
      const startedAt = Date.now();
      const result = await this.deps.toolExecutor.execute(
        { callId: call.callId, name: call.name, arguments: call.arguments },
        ctx
      );
      const elapsed = Date.now() - startedAt;
      logToolNodeResult(this.logger, this.tag, call.name, result.output, elapsed, this.logContext());
      this.logger.debug(
        `${this.tag} 🛠 TOOL result raw: ${call.name} (${elapsed}ms) ` +
          `output=${summarizeForLog(result.output)} ` +
          `sideEffect=${result.sideEffect ? JSON.stringify(result.sideEffect) : "-"}`
      );
      this.emitObserverEvent({
        type: "tool_result",
        callId: call.callId,
        name: call.name,
        output: result.output,
        sideEffect: result.sideEffect,
      });
      client.sendFunctionResult(call.callId, result.output);

      if (result.sideEffect?.kind === "transfer" && this.providerCallId) {
        try {
          await this.deps.onTransferRequested?.(this.providerCallId, result.sideEffect.to);
        } catch (err) {
          this.logger.error(`${this.tag} Transfer failed: ${(err as Error).message}`);
        }
      } else if (result.sideEffect?.kind === "end_call") {
        this.logger.log(`${this.tag} end_call 受領 → 1.5s 後にシャットダウン予約`);
        setTimeout(() => this.shutdown("model_end_call"), 1500);
      }
    });

    client.on("error", (err) => {
      this.logger.error(`${this.tag} ❌ OpenAI error: ${err.message}`);
      this.emitObserverEvent({ type: "error", message: err.message });
    });

    client.on("close", (code, reason) => {
      this.logger.log(`${this.tag} OpenAI WS closed code=${code} reason=${reason || "-"}`);
      this.shutdown("openai_closed");
    });
  }

  /** 発話内容を CallTranscript として保存。callSessionId が無い接続(設定不備)はスキップ。 */
  private async persistTranscript(speaker: "USER" | "AI", content: string) {
    const callSessionId = this.context.callSessionId;
    const save = this.deps.saveTranscript;
    if (!callSessionId || !save || !content.trim()) return;
    const timestamp = this.sessionClock.elapsedSeconds();
    try {
      await save({ callSessionId, speaker, content, timestamp });
    } catch (err) {
      this.logger.warn(
        `${this.tag} failed to persist transcript: ${(err as Error).message}`
      );
    }
  }

  private safeParseJson(raw: string): Record<string, unknown> {
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private logNodeEntry(toolName: string, args: Record<string, unknown>) {
    logToolNodeEntry(this.logger, this.tag, toolName, args, this.logContext());
  }

  private logContext() {
    return {
      ragPrecision: this.context.ragPrecision,
      transferTo: this.context.transferTo,
      notifyTarget: this.context.notifyTarget,
    };
  }

  private sendCpaasAudio(audioBase64: string) {
    this.audioFramer.append(audioBase64, (frame) => this.sendCpaas(frame));
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
    this.logger.log(`${this.tag} ■ shutdown reason=${reason}`);
    this.markSessionEnded(reason);
    if (this.inputAudioLogTimer) {
      clearInterval(this.inputAudioLogTimer);
      this.inputAudioLogTimer = null;
    }
    this.emitObserverEvent({ type: "ended", reason });
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

  private emitObserverEvent(event: BridgeObserverEvent) {
    try {
      this.deps.onEvent?.(event);
    } catch (err) {
      this.logger.warn(`Bridge observer failed: ${(err as Error).message}`);
    }
  }

  private cancelActiveResponse(client: OpenAIRealtimeClient, source: string) {
    this.audioFramer.clear();
    if (!client.isResponseActive()) return;
    this.logger.log(`${this.tag} AI 応答キャンセル(ユーザー割り込み: ${source})`);
    client.cancelResponse();
  }

  private markSessionEnded(reason: string) {
    const callSessionId = this.context.callSessionId;
    const markSessionEnded = this.deps.markSessionEnded;
    if (!callSessionId || !markSessionEnded) return;

    try {
      void markSessionEnded({
        callSessionId,
        endedAt: new Date(),
        durationSeconds: this.sessionClock.elapsedWholeSeconds(),
        reason,
      });
    } catch (err) {
      this.logger.warn(
        `${this.tag} failed to mark session ended: ${(err as Error).message}`
      );
    }
  }
}

export const NTT_CPAAS_REALTIME_AUDIO = {
  sampleRate: NTT_CPAAS_SAMPLE_RATE,
  frameBytes: NTT_CPAAS_FRAME_BYTES,
};
