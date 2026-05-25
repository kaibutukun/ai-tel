import { Logger } from "@nestjs/common";
import WebSocket = require("ws");
import { OpenAIRealtimeClient } from "./openai-realtime.client";
import { NttCpaasDtmfMessage } from "./ntt-cpaas-stream.types";
import {
  ToolContext,
  ToolExecutionResult,
  ToolExecutorService,
} from "./tool-executor.service";
import { FlowEngineService } from "../call-flows/application/flow-engine.service";
import { CompiledRuntimeFlow } from "../call-flows/application/flow-runtime.types";
import {
  REALTIME_BASE_INSTRUCTIONS,
  REALTIME_TOOLS,
} from "./realtime-tools";
import {
  CpaasAudioFramer,
  NTT_CPAAS_FRAME_BYTES,
  NTT_CPAAS_SAMPLE_RATE,
} from "./support/audio-framer";
import { Pcm16BargeInDetector } from "./support/barge-in-detector";
import { RealtimeSessionClock } from "./support/session-clock";
import {
  logToolNodeEntry,
  logToolNodeResult,
  summarizeForLog,
} from "./support/tool-logging";

// ─────────────────────────────────────────────────────────────
// RealtimeBridge (新コア)
//
// 役割は音声 I/O と「Realtime ⇄ ToolExecutor の橋渡し」のみ。
// フローの遷移判断・状態管理は一切しない。
//
//   - 会話の脳 = Realtime API (このコードからは見えない)
//   - フローの正本 = FlowEngine (ToolExecutor 経由で触る)
//
// 開幕シーケンス:
//   1. OpenAI WS 接続 → session.update → session.updated 待ち
//   2. FlowEngine.register で 1 通話分の状態を確保
//   3. 初期 snapshot を system メッセージとして Realtime に注入
//   4. 開幕固定発話を sayExact で一字一句発話 (フローに locked message が無ければ
//      コンパイラがデフォルト挨拶を入れている)
//      で AI に第一声を作らせる
// ─────────────────────────────────────────────────────────────

export interface BridgeContext {
  companyId: string;
  callFlowId: string | null;
  callSessionId: string | null;
  callerNumber?: string;
  transferTo?: string;
  notifyTarget?: string;
  /** dev tester 経由の通話か。同 companyId の旧 dev bridge を新規開始時に切るために使う。 */
  isDev?: boolean;
}

export interface BridgeDeps {
  openAiApiKey: string;
  toolExecutor: ToolExecutorService;
  flowEngine: FlowEngineService;
  /** 通話中に転送が必要になった時に CPaaS API で実際の転送を行うフック (後で実装) */
  onTransferRequested?: (providerCallId: string, to: string) => Promise<void> | void;
  /** 開発用テスターなど、通話の内部イベントを画面へ流したい呼び出し元向け */
  onEvent?: (event: BridgeObserverEvent) => void;
  saveTranscript?: (data: {
    callSessionId: string;
    speaker: "USER" | "AI";
    content: string;
    timestamp: number;
  }) => Promise<void> | void;
  markSessionEnded?: (data: {
    callSessionId: string;
    endedAt: Date;
    durationSeconds: number;
    reason: string;
  }) => Promise<void> | void;
}

export type BridgeObserverEvent =
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
  private assistantTextBuffer = "";
  private inputAudioBytes = 0;
  private inputAudioLogTimer: NodeJS.Timeout | null = null;
  private lastAssistantAudioAt = 0;
  // response.created から最初の音声が CPaaS に届くまでのラグ中に local barge-in が
  // 誤発火すると、AI 第一声が完全に切られて何も聞こえなくなる事故が起こる。
  // この時刻まではユーザー音声 RMS による barge-in を発火させない。
  private bargeInActiveAfter = 0;
  private readonly bargeInGraceMs = (() => {
    const raw = process.env.REALTIME_BARGE_IN_GRACE_MS;
    const n = raw === undefined ? 1500 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 1500;
  })();
  /**
   * AI が直近この時間内に音声を出していたら local barge-in 検知を黙らせる。
   * 値を 0 にすると無効化。デフォルトは 500ms。
   * AI 自身のエコー (ブラウザ AEC をすり抜けた残響など) で誤って barge-in が発火し、
   * 応答が真ん中で切られて「お客様、恐れ入りますが…」みたいに尻切れになる事故防止。
   * OpenAI server_vad は別経路で生きているので、本当にユーザーが被せて喋ってきた
   * ケースは依然キャンセルできる。
   */
  private readonly bargeInAiSpeakingGuardMs = (() => {
    const raw = process.env.REALTIME_BARGE_IN_AI_SPEAKING_GUARD_MS;
    const n = raw === undefined ? 500 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 500;
  })();
  private readonly echoGuardMs = (() => {
    const raw = process.env.REALTIME_ECHO_GUARD_MS;
    const n = raw === undefined ? 200 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 200;
  })();
  private echoGuardDropCount = 0;
  private userBargeInUntil = 0;
  /**
   * ユーザーが今喋っている (speech_started 〜 speech_stopped) 間 true。
   * この間は OpenAI から流れてくる audio_delta を CPaaS に絶対送らない。
   * response.cancel が OpenAI に届くまでのラグでも漏れずに「黙る」を実現する。
   */
  private userSpeaking = false;
  private userSpeakingFallbackTimer: NodeJS.Timeout | null = null;
  // request_end_call を受けても即 shutdown はしない。AI の最終発話 (お礼) が
  // 全部 CPaaS に流れ終わってから切らないと「失礼しまs」で切断される。
  // 流れ:
  //   1. request_end_call 受領 → pendingEndCallReason をセット + 安全弁タイマー
  //   2. その後の response.done (status=completed) で audio buffer 余裕を持って shutdown
  //   3. 何らかの理由で response.done が来ない場合は安全弁タイマーで強制 shutdown
  private pendingEndCallReason: string | null = null;
  private pendingEndCallSafetyTimer: NodeJS.Timeout | null = null;
  private pendingEndCallFinalizeTimer: NodeJS.Timeout | null = null;
  private suppressedAudioDeltas = 0;
  /**
   * userTranscript 受領時にまだ前ターンの response が active (cancel 送信直後で
   * response.done が来てない等) だった場合、ここに true を立てて responseDone で
   * createResponse を後追いする。これをやらないと OpenAI に
   * conversation_already_has_active_response エラーで弾かれて発話が止まる。
   */
  private pendingResponseTurn = false;
  /**
   * 現在 active な response 中に CPaaS (= 受話側) へ送出した音声バイト数。
   * OpenAI からの audio_delta はほぼ生成完了とともに一気に届くが、受話側 (NTT CPaaS or
   * dev browser) は実時間ペースで再生するため、response.done = 再生完了 ではない。
   * end_call 時にこのバイト数 / (24kHz×16bit = 48 B/ms) で再生残時間を計算し、
   * 「お電話ありがとうございました。」が最後まで鳴り終わるのを待ってから shutdown する。
   */
  private currentResponseAudioBytes = 0;
  private currentResponseStartedAt = 0;
  private currentResponseSuppressedAudioDeltas = 0;

  constructor(
    private readonly cpaasWs: WebSocket,
    private readonly compiled: CompiledRuntimeFlow,
    private readonly context: BridgeContext,
    private readonly deps: BridgeDeps
  ) {
    this.attachCpaasListeners();
  }

  private get tag(): string {
    return `[${this.providerCallId ?? "no-callid"}]`;
  }

  get companyId(): string {
    return this.context.companyId;
  }

  get isDevBridge(): boolean {
    return Boolean(this.context.isDev);
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
      `${this.tag} compiled flow: nodes=${Object.keys(this.compiled.nodes).length} ` +
        `tools=[${REALTIME_TOOLS.map((t) => t.name).join(", ")}] ` +
        `opening=${this.compiled.openingLockedMessageNodeId ? "locked" : "default"} ` +
        `faqMinScore=${this.compiled.faqMinScore} ` +
        `documentMinScore=${this.compiled.documentMinScore} ` +
        `echoGuard=${this.echoGuardMs}ms`
    );

    try {
      this.openai = new OpenAIRealtimeClient(this.deps.openAiApiKey);
      this.attachOpenAiListeners(this.openai);
      await this.openai.connect();
      if (this.closed) return;
      this.logger.log(`${this.tag} OpenAI WS connected`);

      const voice = process.env.OPENAI_REALTIME_VOICE || "alloy";
      try {
        await this.openai.updateSession({
          instructions: REALTIME_BASE_INSTRUCTIONS,
          tools: REALTIME_TOOLS,
          inputAudioFormat: "pcm16",
          outputAudioFormat: "pcm16",
          voice,
        });
        if (this.closed) return;
        this.logger.log(`${this.tag} session.updated ack received (voice=${voice})`);
      } catch (err) {
        this.logger.warn(
          `${this.tag} session.update ack timeout/error: ${(err as Error).message}`
        );
        if (this.closed) return;
      }

      // FlowEngine にこの通話分のセッションを登録。callSessionId が無い場合 (設定不備)
      // はフロー機能を使えないので、その旨を脳に伝えるだけにする。
      if (this.context.callSessionId) {
        this.deps.flowEngine.register({
          callSessionId: this.context.callSessionId,
          companyId: this.context.companyId,
          callFlowId: this.context.callFlowId,
          callerNumber: this.context.callerNumber,
          compiled: this.compiled,
          defaults: {
            transferTo: this.context.transferTo,
            notifyTarget: this.context.notifyTarget,
          },
        });
        const snapshot = this.deps.flowEngine.snapshot(this.context.callSessionId);
        // 「指示文」っぽい書き方を避け、データ行 1 本だけ置く。
        // 「行動してください」のような語尾があると AI がこれをユーザーの依頼として
        // 受け取って「承知しました」のような返答を作ってしまうので、tag + JSON のみ。
        this.openai.injectSystemNote(
          `flow_state=${JSON.stringify(snapshot)}`
        );
        this.logger.debug(
          `${this.tag} initial snapshot injected: currentNode=${snapshot.currentNode?.id ?? "-"}`
        );
      } else {
        this.openai.injectSystemNote("flow_state=null");
      }

      // 開幕は常に sayExact で固定文を一字一句発話させる。AI に自由に第一声を作らせると
      // 直前の system note や instructions を「依頼」と解釈して「承知しました」等のおかしい
      // 第一声を出すケースがあったため。フローに locked message が無くてもコンパイラが
      // DEFAULT_OPENING_MESSAGE を入れている。
      const opening = this.compiled.openingMessage;
      this.logger.log(
        `${this.tag} 🤖 OPENING (${this.compiled.openingLockedMessageNodeId ? "locked" : "default"}): ${opening}`
      );
      this.openai.sayExact(opening);

      this.startInputAudioMonitor();
    } catch (err) {
      this.logger.error(
        `${this.tag} Failed to start OpenAI session: ${(err as Error).message}`
      );
      this.shutdown("openai_connect_failed");
    }
  }

  private startInputAudioMonitor() {
    if (this.inputAudioLogTimer) return;
    this.inputAudioLogTimer = setInterval(() => {
      if (this.closed) return;
      const kbps = ((this.inputAudioBytes * 8) / 1000 / 3).toFixed(1);
      const echoDrop = this.echoGuardDropCount;
      const suffix = echoDrop > 0 ? ` echoGuardDrops=${echoDrop}` : "";
      if (this.inputAudioBytes === 0) {
        this.logger.warn(
          `${this.tag} ⚠ 入力音声が直近3秒で 0 バイト (マイク無音 or 経路断)`
        );
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
        this.logger.warn(
          `Failed to handle NTT CPaaS message: ${(err as Error).message}`
        );
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
    // grace 期間中 / AI が直近に喋っていた間は local barge-in を発火させない。
    //   - grace: AI 第一声が response.created 直後のラグで消える事故防止
    //   - AI speaking guard: AI 自身のエコーを「ユーザーが被せた」と誤検知して
    //     応答を真ん中で切る事故防止 (例: 「お客様、恐れ入りますが…」で尻切れ)
    // OpenAI の server_vad による speech_started は別経路で来るので、ここを抑えても
    // 本当にユーザーが喋り始めた時は cancel される。
    const now = Date.now();
    const aiSpeakingRecently =
      this.bargeInAiSpeakingGuardMs > 0 &&
      this.lastAssistantAudioAt > 0 &&
      now - this.lastAssistantAudioAt < this.bargeInAiSpeakingGuardMs;
    const bargeInArmed =
      !!client?.isResponseActive() &&
      now >= this.bargeInActiveAfter &&
      !aiSpeakingRecently;
    if (
      client &&
      this.bargeInDetector.shouldInterrupt(audio, bargeInArmed)
    ) {
      this.userBargeInUntil = Date.now() + 1200;
      this.setUserSpeaking(true, "local audio barge-in");
      this.cancelActiveResponse(client, "local audio barge-in");
    }

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
      // ユーザー発話中は AI 音声を絶対 CPaaS に流さない。OpenAI 側の response.cancel が
      // 適用されるまでのラグ中に届く delta を確実にドロップする。
      if (this.userSpeaking) {
        this.suppressedAudioDeltas += 1;
        this.currentResponseSuppressedAudioDeltas += 1;
        return;
      }
      this.lastAssistantAudioAt = Date.now();
      this.sendCpaasAudio(audio);
      // end_call の音声排出待ち計算用に、受話側へ流した量を累計する。
      // 抑制された delta はカウントしない (実際には送ってないので)。
      this.currentResponseAudioBytes += Buffer.byteLength(audio, "base64");
    });

    client.on("textDelta", (text) => {
      this.assistantTextBuffer += text;
    });

    client.on("responseCreated", () => {
      this.assistantTextBuffer = "";
      this.bargeInActiveAfter = Date.now() + this.bargeInGraceMs;
      // 音声排出待ち計算用の累計をリセット
      this.currentResponseAudioBytes = 0;
      this.currentResponseStartedAt = Date.now();
      this.currentResponseSuppressedAudioDeltas = 0;
      this.logger.log(`${this.tag} ▷ response.created (AI 応答生成開始)`);
    });

    client.on("responseTranscriptDone", (transcript) => {
      this.assistantTextBuffer = transcript;
    });

    client.on("responseDone", (event) => {
      const r = (event as { response?: Record<string, unknown> }).response;
      const status = (r?.status as string | undefined) ?? "-";
      const usage = r?.usage ? JSON.stringify(r.usage) : "-";
      const statusDetails = r?.status_details
        ? JSON.stringify(r.status_details)
        : null;
      const assistantTranscript = this.assistantTextBuffer.trim();
      this.assistantTextBuffer = "";
      this.logger.log(
        `${this.tag} ◁ response.done status=${status} usage=${usage}` +
          (statusDetails ? ` details=${statusDetails}` : "")
      );
      if (status && status !== "completed") {
        this.logger.warn(
          `${this.tag} ⚠ response.status=${status} → 応答が完了していない可能性`
        );
      }
      if (
        status === "completed" &&
        assistantTranscript &&
        this.currentResponseAudioBytes > 0 &&
        this.currentResponseSuppressedAudioDeltas === 0
      ) {
        const audioDurationMs = this.currentResponseAudioBytes / 48;
        const elapsedMs =
          this.currentResponseStartedAt > 0
            ? Date.now() - this.currentResponseStartedAt
            : audioDurationMs;
        const waitMs = Math.max(0, audioDurationMs - elapsedMs);
        setTimeout(() => {
          if (this.closed) return;
          this.logger.log(`${this.tag} 🤖 AI: ${assistantTranscript}`);
          this.emitObserverEvent({
            type: "assistant_transcript_done",
            text: assistantTranscript,
          });
          void this.persistTranscript("AI", assistantTranscript);
        }, waitMs);
      }
      // request_end_call が予約されている場合、最終発話 (お礼) が完了したと判断
      // できるこのタイミングで、音声バッファ flush 用に少しだけ猶予を取って shutdown。
      // cancelled (ユーザー割り込み) は最終発話ではないので無視して次の completed を待つ。
      if (this.pendingEndCallReason && status === "completed") {
        this.finalizePendingEndCall();
        return;
      }
      // 直前の userTranscript で active な前ターンに被って弾かれていたケースの後追い。
      // この時点で responseActive は false に戻っているので、安全に createResponse できる。
      if (this.pendingResponseTurn && !this.closed) {
        this.pendingResponseTurn = false;
        this.logger.debug(
          `${this.tag} pending response turn → createResponse (前ターン解消後)`
        );
        this.startResponseTurn(client);
      }
    });

    client.on("userTranscript", (transcript) => {
      this.logger.log(`${this.tag} 👤 USER: ${transcript}`);
      this.emitObserverEvent({ type: "user_transcript", text: transcript });
      void this.persistTranscript("USER", transcript);
      // FlowEngine 側にも直近 transcript を渡す。end_call の同意ガード等が
      // 「直前のユーザー発話」を読み取れるようにするため。
      if (this.context.callSessionId) {
        this.deps.flowEngine.recordUserTranscript(
          this.context.callSessionId,
          transcript
        );
      }
      // create_response: false 設定なので、ユーザー発話が確定したら能動的に
      // 応答を起動する。直前に「現在の snapshot 要点」を system note で再注入し、
      // 脳が常に最新のフロー状態を見て喋るようにする (会話のかみ合わせ対策)。
      this.startResponseTurn(client);
    });

    client.on("speechStarted", () => {
      this.logger.debug(`${this.tag} ▷ user speech_started (AI を即黙らせる)`);
      this.userBargeInUntil = Date.now() + 1200;
      this.setUserSpeaking(true, "OpenAI speech_started");
      this.cancelActiveResponse(client, "OpenAI speech_started");
    });

    client.on("speechStopped", () => {
      this.logger.debug(`${this.tag} ◁ user speech_stopped`);
      this.setUserSpeaking(false, "OpenAI speech_stopped");
    });

    client.on("sessionUpdated", () => {
      this.logger.debug(`${this.tag} session.updated event received`);
    });

    client.on("functionCall", async (call) => {
      const parsedArgs = this.safeParseJson(call.arguments);
      logToolNodeEntry(this.logger, this.tag, call.name, parsedArgs);
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
        callSessionId: this.context.callSessionId ?? "",
        companyId: this.context.companyId,
        callFlowId: this.context.callFlowId,
        callerNumber: this.context.callerNumber,
      };

      const startedAt = Date.now();
      const result = await this.deps.toolExecutor.execute(
        { callId: call.callId, name: call.name, arguments: call.arguments },
        ctx
      );
      const elapsed = Date.now() - startedAt;
      logToolNodeResult(this.logger, this.tag, call.name, result.output, elapsed);
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
          await this.deps.onTransferRequested?.(
            this.providerCallId,
            result.sideEffect.to
          );
        } catch (err) {
          this.logger.error(
            `${this.tag} Transfer failed: ${(err as Error).message}`
          );
        }
      } else if (result.sideEffect?.kind === "end_call") {
        this.scheduleEndCall(result.sideEffect.reason);
      }
    });

    client.on("error", (err) => {
      this.logger.error(`${this.tag} ❌ OpenAI error: ${err.message}`);
      this.emitObserverEvent({ type: "error", message: err.message });
    });

    client.on("close", (code, reason) => {
      this.logger.log(
        `${this.tag} OpenAI WS closed code=${code} reason=${reason || "-"}`
      );
      this.shutdown("openai_closed");
    });
  }

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
    if (this.context.callSessionId) {
      this.deps.flowEngine.unregister(this.context.callSessionId);
    }
    if (this.inputAudioLogTimer) {
      clearInterval(this.inputAudioLogTimer);
      this.inputAudioLogTimer = null;
    }
    if (this.userSpeakingFallbackTimer) {
      clearTimeout(this.userSpeakingFallbackTimer);
      this.userSpeakingFallbackTimer = null;
    }
    if (this.pendingEndCallSafetyTimer) {
      clearTimeout(this.pendingEndCallSafetyTimer);
      this.pendingEndCallSafetyTimer = null;
    }
    if (this.pendingEndCallFinalizeTimer) {
      clearTimeout(this.pendingEndCallFinalizeTimer);
      this.pendingEndCallFinalizeTimer = null;
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
    this.logger.log(
      `${this.tag} AI 応答キャンセル(ユーザー割り込み: ${source})`
    );
    client.cancelResponse();
  }

  /**
   * request_end_call を受けた時の待機。
   * AI は通常この後「お電話ありがとうございました。失礼いたします。」のような
   * お礼発話を出すので、その response.done が来てから shutdown する。
   * 一定時間内に response.done が来なければ安全弁で強制 shutdown する。
   */
  private scheduleEndCall(reason?: string) {
    if (this.pendingEndCallReason) return;
    this.pendingEndCallReason = reason ?? "model_end_call";
    this.logger.log(
      `${this.tag} end_call 受領 → 最終発話完了を待ってシャットダウン (reason=${this.pendingEndCallReason})`
    );
    const safetyMs = 8000;
    this.pendingEndCallSafetyTimer = setTimeout(() => {
      if (!this.pendingEndCallReason) return;
      this.logger.warn(
        `${this.tag} end_call 安全弁発火 (${safetyMs}ms 内に response.done が来ず)`
      );
      this.finalizePendingEndCall();
    }, safetyMs);
  }

  /**
   * 最終発話の response.done を受けてから shutdown するまでの猶予。
   * 旧実装は固定 1200ms 待ちだったが、CpaasAudioFramer はバッファをほぼ即時に
   * 受話側へ flush する一方、受話側は実時間ペースで再生するので、長文の最終発話
   * (「お電話ありがとうございました。失礼いたします。」等) では再生途中で WS が
   * 閉じられて尻切れになる事故が起きていた。
   * このターンで実際に送出した音声バイト数から再生に必要な総時間を算出し、
   * 既に経過した時間との差 (= バックログ) + 余韻 を待ってから shutdown する。
   *   pcm16 / 24kHz / mono = 48 B/ms なので audioDurationMs = bytes / 48。
   */
  private finalizePendingEndCall() {
    if (!this.pendingEndCallReason || this.pendingEndCallFinalizeTimer) return;
    const reason = this.pendingEndCallReason;

    const audioDurationMs = this.currentResponseAudioBytes / 48;
    const elapsedMs =
      this.currentResponseStartedAt > 0
        ? Date.now() - this.currentResponseStartedAt
        : audioDurationMs;
    const backlogMs = Math.max(0, audioDurationMs - elapsedMs);
    const safetyTailMs = 700;
    // 暴走防止のハードキャップ。ここまで待っても shutdown しないということは無い。
    const HARD_CAP_MS = 15000;
    const totalWait = Math.min(backlogMs + safetyTailMs, HARD_CAP_MS);

    this.logger.log(
      `${this.tag} end_call: drain wait=${totalWait}ms ` +
        `(audioDur=${Math.round(audioDurationMs)}ms elapsed=${elapsedMs}ms ` +
        `backlog=${Math.round(backlogMs)}ms tail=${safetyTailMs}ms)`
    );

    this.pendingEndCallFinalizeTimer = setTimeout(() => {
      this.pendingEndCallFinalizeTimer = null;
      this.pendingEndCallReason = null;
      if (this.pendingEndCallSafetyTimer) {
        clearTimeout(this.pendingEndCallSafetyTimer);
        this.pendingEndCallSafetyTimer = null;
      }
      this.shutdown(reason);
    }, totalWait);
  }

  /**
   * ユーザー発話状態を上書きする。speech_started/stopped が片側だけ来ても
   * 復旧できるよう、true 側には 5s のフォールバック解除を仕込む。
   */
  private setUserSpeaking(speaking: boolean, source: string) {
    if (this.userSpeaking === speaking) return;
    this.userSpeaking = speaking;
    if (this.userSpeakingFallbackTimer) {
      clearTimeout(this.userSpeakingFallbackTimer);
      this.userSpeakingFallbackTimer = null;
    }
    if (speaking) {
      this.userSpeakingFallbackTimer = setTimeout(() => {
        if (this.userSpeaking) {
          this.logger.warn(
            `${this.tag} userSpeaking auto-release (speech_stopped が 5s 来ず) ` +
              `suppressedDeltas=${this.suppressedAudioDeltas}`
          );
          this.userSpeaking = false;
          this.userSpeakingFallbackTimer = null;
        }
      }, 5000);
    } else if (this.suppressedAudioDeltas > 0) {
      this.logger.debug(
        `${this.tag} userSpeaking off (via ${source}) — suppressed ${this.suppressedAudioDeltas} audio_delta`
      );
      this.suppressedAudioDeltas = 0;
    }
    this.logger.debug(
      `${this.tag} userSpeaking=${speaking} via ${source}`
    );
  }

  /**
   * 「ユーザー発話 → AI 応答ターン」を 1 件起動する。
   * 直前ターンが片付いていない (cancel 送信直後で response.done 未着 等) 場合は
   * createResponse を打つと OpenAI に conversation_already_has_active_response で
   * 弾かれるので、フラグを立てて responseDone 時に後追い実行する。
   */
  private startResponseTurn(client: OpenAIRealtimeClient) {
    if (this.closed) return;
    if (client.isResponseActive()) {
      this.pendingResponseTurn = true;
      this.logger.debug(
        `${this.tag} startResponseTurn: response 進行中のため後追いに回す`
      );
      return;
    }
    this.injectSnapshotReminder(client);
    client.createResponse();
  }

  /**
   * userTranscript 確定後、能動 createResponse の前に「現在ノード/許可遷移/未収集」を
   * system note で 1 行注入する。tool 戻り値の snapshot とは別系統で、ユーザーが
   * フリーフォームに質問してきたケース (tool を経由せず喋り始める時) でも脳が
   * 最新のフロー状態を見て応答できるようにする保険。
   */
  private injectSnapshotReminder(client: OpenAIRealtimeClient) {
    if (!this.context.callSessionId) return;
    const snapshot = this.deps.flowEngine.snapshot(this.context.callSessionId);
    const current = snapshot.currentNode;
    if (!current) return;
    const actionTag = current.actionType ? `/${current.actionType}` : "";
    const next =
      snapshot.allowedNextNodes
        .map((n) =>
          n.condition
            ? `${n.id}(${n.summary} / 条件: ${n.condition})`
            : `${n.id}(${n.summary})`
        )
        .join(", ") || "なし";
    const missing =
      snapshot.missingSlots.length > 0
        ? ` missingSlots=${JSON.stringify(snapshot.missingSlots)}`
        : "";
    const slotsCount = Object.keys(snapshot.collectedSlots).length;
    const slots = slotsCount > 0 ? ` collectedSlots(${slotsCount}件)` : "";
    client.injectSystemNote(
      `📍 current=${current.id}(${current.type}${actionTag})${missing}${slots} allowedNext=[${next}] guidance: ${current.guidance}`
    );
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
