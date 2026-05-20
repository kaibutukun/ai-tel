import { Logger } from "@nestjs/common";
import WebSocket = require("ws");
import { OpenAIRealtimeClient } from "./openai-realtime-client";
import { NttCpaasDtmfMessage } from "./ntt-cpaas-stream.types";
import { CompiledFlowV2 } from "../call-flows/flow-compiler.service";
import { ToolExecutionResult, ToolExecutorService } from "./tool-executor.service";
import {
  Director,
  DirectorContext,
  DirectorObserverEvent,
} from "../supervisor/director";
import { SupervisorService } from "../supervisor/supervisor.service";
import {
  CpaasAudioFramer,
  NTT_CPAAS_FRAME_BYTES,
  NTT_CPAAS_SAMPLE_RATE,
  Pcm16BargeInDetector,
} from "./core/audio";
import { RealtimeSessionClock } from "./core/clock";

// ─────────────────────────────────────────────────────────────
// VoiceBridge (旧 RealtimeBridge)
//
// 音声 I/O 専任。フローの解釈は一切しない。
//
// 役割:
//  - NTT CPaaS の WebSocket とのバイナリ音声 pipe
//  - OpenAI Realtime API との pcm16 pipe
//  - aggressive barge-in: ユーザー発話を検知したら即 Speaker をキャンセル、
//    その後ユーザーが完全に話し終わるまで Speaker は完全に黙る
//  - userTranscript 確定で Director.onUserTurnDone() を起動
//  - Speaker からの function call を Director に渡す
//  - CallTranscript の永続化フックを呼ぶ
// ─────────────────────────────────────────────────────────────

export interface BridgeContext {
  companyId: string;
  callFlowId: string | null;
  callSessionId: string | null;
  callerNumber?: string;
  transferTo?: string;
  notifyTarget?: string;
  /** Brain LLM のモデル名（Company.brainModel から渡される。null可） */
  brainModel: string | null;
}

export interface BridgeDeps {
  openAiApiKey: string;
  toolExecutor: ToolExecutorService;
  supervisor: SupervisorService;
  /** CPaaS 側に「実際に転送して」と指示するためのフック */
  onTransferRequested?: (providerCallId: string, to: string) => Promise<void> | void;
  /** dev tester 等が通話イベントを観測するためのフック */
  onEvent?: (event: BridgeObserverEvent) => void;
  /** USER/AI 発話確定時に CallTranscript として永続化するフック */
  saveTranscript?: (data: {
    callSessionId: string;
    speaker: "USER" | "AI";
    content: string;
    timestamp: number;
  }) => Promise<void> | void;
  /** WS 切断時に CallSession の終了情報を補完するフック */
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
  | { type: "brain"; event: DirectorObserverEvent }
  | { type: "error"; message: string }
  | { type: "ended"; reason: string };

export class RealtimeBridge {
  private readonly logger = new Logger(RealtimeBridge.name);
  private providerCallId: string | null = null;
  private speaker: OpenAIRealtimeClient | null = null;
  private director: Director | null = null;
  private closed = false;
  private readonly audioFramer = new CpaasAudioFramer();
  private readonly bargeInDetector = new Pcm16BargeInDetector();
  private readonly sessionClock = new RealtimeSessionClock();

  private assistantTextBuffer = "";
  private inputAudioBytes = 0;
  private inputAudioLogTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cpaasWs: WebSocket,
    private readonly compiled: CompiledFlowV2,
    private readonly context: BridgeContext,
    private readonly deps: BridgeDeps
  ) {
    this.attachCpaasListeners();
  }

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
        `caller=${this.context.callerNumber ?? "-"} ` +
        `brainModel=${this.context.brainModel ?? "(env/default)"}`
    );

    try {
      this.speaker = new OpenAIRealtimeClient(this.deps.openAiApiKey);
      this.attachOpenAiListeners(this.speaker);
      await this.speaker.connect();
      if (this.closed) return;

      const voice = process.env.OPENAI_REALTIME_VOICE || "alloy";
      try {
        await this.speaker.updateSession({
          instructions: this.compiled.speakerSystemPrompt,
          tools: this.compiled.speakerTools,
          inputAudioFormat: "pcm16",
          outputAudioFormat: "pcm16",
          voice,
          turnDetection: {
            type: "server_vad",
            // 「問答無用で黙る」を担保するため、ユーザー発話開始時は自動でキャンセルさせる
            interruptResponse: true,
            // 自動応答は無効化し、Brain 判断を経て Director が手動で createResponse する
            createResponse: false,
          },
        });
        if (this.closed) return;
        this.logger.log(`${this.tag} session.updated (voice=${voice}, gated by Brain)`);
      } catch (err) {
        this.logger.warn(`${this.tag} session.update ack timeout/error: ${(err as Error).message}`);
        if (this.closed) return;
      }

      // Brain と Director を生成
      const brain = this.deps.supervisor.createSession({
        callSessionId: this.context.callSessionId,
        model: this.context.brainModel ?? "",
        compiled: this.compiled,
      });

      this.director = new Director({
        speaker: this.speaker,
        brain,
        toolExecutor: this.deps.toolExecutor,
        compiled: this.compiled,
        context: this.buildDirectorContext(),
        postBrainPauseMs: this.readNumberEnv("REALTIME_POST_BRAIN_PAUSE_MS", 100),
        tag: this.tag,
        onEvent: (event) => this.emitObserverEvent({ type: "brain", event }),
        onToolCall: (call) =>
          this.emitObserverEvent({
            type: "function_call",
            callId: call.callId,
            name: call.name,
            arguments: call.arguments,
          }),
        onToolResult: (result) =>
          this.emitObserverEvent({
            type: "tool_result",
            callId: result.callId,
            name: result.name,
            output: result.output,
            sideEffect: result.sideEffect,
          }),
        onTransferRequested: async (to) => {
          if (!this.providerCallId) return;
          await this.deps.onTransferRequested?.(this.providerCallId, to);
        },
        onEndCallRequested: (reason) => {
          this.logger.log(`${this.tag} end_call 受領 → 1.5s 後にシャットダウン予約`);
          setTimeout(() => this.shutdown(reason ? `model_end_call:${reason}` : "model_end_call"), 1500);
        },
      });
      this.director.attachClock(() => this.sessionClock.elapsedSeconds());

      // 開幕の固定発話。Director.turns への記録は responseTranscriptDone 経由で行われるので
      // ここで明示的に recordAssistantTurn を呼ばない (二重カウント防止)。
      const opening = this.compiled.openingMessage;
      this.logger.log(`${this.tag} 🤖 OPENING: ${opening}`);
      this.speaker.injectAssistantUtterance(opening);

      this.startInputAudioMonitor();
    } catch (err) {
      this.logger.error(`${this.tag} Failed to start: ${(err as Error).message}`);
      this.shutdown("openai_connect_failed");
    }
  }

  private buildDirectorContext(): DirectorContext {
    return {
      companyId: this.context.companyId,
      callSessionId: this.context.callSessionId,
      callFlowId: this.context.callFlowId,
      callerNumber: this.context.callerNumber,
      defaults: {
        transferTo: this.context.transferTo,
        notifyTarget: this.context.notifyTarget,
      },
    };
  }

  private readNumberEnv(name: string, fallback: number) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : fallback;
  }

  private startInputAudioMonitor() {
    if (this.inputAudioLogTimer) return;
    this.inputAudioLogTimer = setInterval(() => {
      if (this.closed) return;
      const kbps = ((this.inputAudioBytes * 8) / 1000 / 3).toFixed(1);
      if (this.inputAudioBytes === 0) {
        this.logger.warn(`${this.tag} ⚠ 入力音声が直近3秒で 0 バイト`);
      } else {
        this.logger.debug(
          `${this.tag} input audio: ${this.inputAudioBytes} bytes / 3s (≈${kbps} kbps)`
        );
      }
      this.inputAudioBytes = 0;
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
          // 将来: DTMF ショートカット
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

    const client = this.speaker;
    if (!client) return;

    // aggressive barge-in: ユーザー発話を検知した瞬間に Speaker をキャンセル
    if (this.bargeInDetector.shouldInterrupt(audio, client.isResponseActive())) {
      this.handleBargeIn("local audio barge-in");
    }

    client.appendInputAudio(audio.toString("base64"));
  }

  private handleBargeIn(source: string) {
    const client = this.speaker;
    if (!client) return;
    this.audioFramer.clear();
    if (client.isResponseActive()) {
      this.logger.log(`${this.tag} 🛑 AI 応答キャンセル(${source})`);
      client.cancelResponse();
    }
    // Speaker は create_response=false なのでユーザーが話し終わるまで自動再開しない。
    // Director の gating で次の onUserTurnDone まで応答を作らせない。
    this.director?.onUserBargeIn();
  }

  private attachOpenAiListeners(client: OpenAIRealtimeClient) {
    client.on("audioDelta", (audio) => {
      this.sendCpaasAudio(audio);
    });

    client.on("textDelta", (text) => {
      this.assistantTextBuffer += text;
      this.emitObserverEvent({ type: "text_delta", text });
    });

    client.on("responseCreated", () => {
      this.assistantTextBuffer = "";
      this.logger.log(`${this.tag} ▷ response.created`);
    });

    client.on("responseTranscriptDone", (transcript) => {
      this.logger.log(`${this.tag} 🤖 AI: ${transcript}`);
      this.emitObserverEvent({ type: "assistant_transcript_done", text: transcript });
      this.director?.recordAssistantTurn(transcript);
      void this.persistTranscript("AI", transcript);
    });

    client.on("responseDone", (event) => {
      const r = (event as { response?: Record<string, unknown> }).response;
      const status = (r?.status as string | undefined) ?? "-";
      if (this.assistantTextBuffer.trim()) {
        this.logger.log(`${this.tag} 🤖 AI(buffered): ${this.assistantTextBuffer.trim()}`);
      }
      this.assistantTextBuffer = "";
      this.logger.log(`${this.tag} ◁ response.done status=${status}`);
    });

    client.on("userTranscript", (transcript) => {
      this.logger.log(`${this.tag} 👤 USER: ${transcript}`);
      this.emitObserverEvent({ type: "user_transcript", text: transcript });
      this.director?.recordUserTurn(transcript);
      void this.persistTranscript("USER", transcript);
      // Brain → Speaker サイクル起動
      this.director?.onUserTurnDone(transcript);
    });

    client.on("speechStarted", () => {
      this.logger.debug(`${this.tag} ▷ user speech_started`);
      this.handleBargeIn("OpenAI speech_started");
    });

    client.on("speechStopped", () => {
      this.logger.debug(`${this.tag} ◁ user speech_stopped`);
    });

    client.on("sessionUpdated", () => {
      this.logger.debug(`${this.tag} session.updated event`);
    });

    client.on("functionCall", async (call) => {
      await this.director?.handleFunctionCall(call);
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
    this.director?.shutdown();
    if (this.inputAudioLogTimer) {
      clearInterval(this.inputAudioLogTimer);
      this.inputAudioLogTimer = null;
    }
    this.emitObserverEvent({ type: "ended", reason });
    try {
      this.speaker?.close();
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
