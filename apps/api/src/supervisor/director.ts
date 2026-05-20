import { Logger } from "@nestjs/common";
import { BrainFlowNode, CompiledFlowV2 } from "../call-flows/flow-compiler.service";
import { OpenAIRealtimeClient } from "../realtime/openai-realtime-client";
import {
  ToolContext,
  ToolExecutionResult,
  ToolExecutorService,
} from "../realtime/tool-executor.service";
import {
  logToolNodeEntry,
  logToolNodeResult,
  summarizeForLog,
} from "../realtime/core/tool-logging";
import { BrainSession } from "./supervisor.service";
import { BrainCommand, BrainTurn } from "./supervisor-types";

// ─────────────────────────────────────────────────────────────
// Director
//
// Brain (Supervisor) と Speaker (Realtime AI) の橋渡し役。
// 通話 1 本ごとにインスタンス化される。
//
// 役割:
//  - userTranscript 確定で Brain.tick() を起動 (= 新サイクル)
//  - BrainCommand を Speaker への注入操作 + createResponse() に翻訳
//  - current node に基づいて Speaker からの tool call を許可/拒否する
//  - FAQ/RAG action node では Director が内部 lookup を実行し、結果を Speaker に注入
//
// race 制御 (epoch):
//  各サイクルは生成時に `epoch` を払い出す。新しいサイクル開始や
//  ユーザー barge-in で epoch をインクリメントし、古いサイクルが
//  途中で createResponse() を打たないように毎ステップで照合する。
// ─────────────────────────────────────────────────────────────

export interface DirectorContext {
  companyId: string;
  callSessionId: string | null;
  callFlowId: string | null;
  callerNumber?: string;
  defaults: {
    transferTo?: string;
    notifyTarget?: string;
  };
}

export type DirectorObserverEvent =
  | { type: "brain_command"; command: BrainCommand }
  | { type: "brain_tool_executed"; tool: string; query: string; ok: boolean };

export type DirectorToolCallEvent = {
  callId: string;
  name: string;
  arguments: string;
};

export type DirectorToolResultEvent = {
  callId: string;
  name: string;
  output: ToolExecutionResult["output"];
  sideEffect?: ToolExecutionResult["sideEffect"];
};

export interface DirectorDeps {
  speaker: OpenAIRealtimeClient;
  brain: BrainSession;
  toolExecutor: ToolExecutorService;
  compiled: CompiledFlowV2;
  context: DirectorContext;
  /** Brain 完了後、Speaker 起動までに最低限置く間（ms）。自然さのため */
  postBrainPauseMs?: number;
  tag?: string;
  onEvent?: (event: DirectorObserverEvent) => void;
  onToolCall?: (event: DirectorToolCallEvent) => void;
  onToolResult?: (event: DirectorToolResultEvent) => void;
  onTransferRequested?: (to: string, reason?: string) => Promise<void> | void;
  onEndCallRequested?: (reason?: string) => void;
}

export class Director {
  private readonly logger = new Logger(Director.name);
  private readonly speaker: OpenAIRealtimeClient;
  private readonly brain: BrainSession;
  private readonly toolExecutor: ToolExecutorService;
  private readonly compiled: CompiledFlowV2;
  private readonly context: DirectorContext;
  private readonly postBrainPauseMs: number;
  private readonly tag: string;
  private readonly onEvent?: (event: DirectorObserverEvent) => void;
  private readonly onToolCall?: (event: DirectorToolCallEvent) => void;
  private readonly onToolResult?: (event: DirectorToolResultEvent) => void;
  private readonly onTransferRequested?: (to: string, reason?: string) => Promise<void> | void;
  private readonly onEndCallRequested?: (reason?: string) => void;

  private turns: BrainTurn[] = [];
  private readonly knowledgeLookups = new Set<string>();
  private endCallAllowed = false;
  /** 現在有効なサイクル番号。barge-in や新ターンでインクリメントされる。 */
  private epoch = 0;
  private getElapsedSec: () => number = () => 0;
  private closed = false;

  constructor(deps: DirectorDeps) {
    this.speaker = deps.speaker;
    this.brain = deps.brain;
    this.toolExecutor = deps.toolExecutor;
    this.compiled = deps.compiled;
    this.context = deps.context;
    this.postBrainPauseMs = deps.postBrainPauseMs ?? 100;
    this.tag = deps.tag ?? `[director ${deps.context.callSessionId ?? "no-session"}]`;
    this.onEvent = deps.onEvent;
    this.onToolCall = deps.onToolCall;
    this.onToolResult = deps.onToolResult;
    this.onTransferRequested = deps.onTransferRequested;
    this.onEndCallRequested = deps.onEndCallRequested;
  }

  attachClock(getElapsedSec: () => number) {
    this.getElapsedSec = getElapsedSec;
  }

  // ────────────────────────────────────────────
  // 履歴記録
  // ────────────────────────────────────────────

  recordUserTurn(text: string) {
    if (!text.trim()) return;
    this.turns.push({ speaker: "USER", text, atSeconds: this.getElapsedSec() });
  }

  recordAssistantTurn(text: string) {
    if (!text.trim()) return;
    this.turns.push({ speaker: "AI", text, atSeconds: this.getElapsedSec() });
  }

  // ────────────────────────────────────────────
  // ユーザー発話イベント
  // ────────────────────────────────────────────

  /** userTranscript 確定で呼ばれる。Brain → Speaker サイクルを開始する。 */
  onUserTurnDone(text: string) {
    if (this.closed) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    const myEpoch = ++this.epoch;
    this.runCycle(myEpoch, trimmed).catch((err) => {
      this.logger.warn(`cycle ${myEpoch} failed: ${(err as Error).message}`);
    });
  }

  /**
   * バージイン発生で呼ばれる。epoch をインクリメントすることで、
   * 走行中の古い Brain サイクルが createResponse() を打たないようにする。
   */
  onUserBargeIn() {
    this.epoch += 1;
    this.endCallAllowed = false;
  }

  shutdown() {
    this.closed = true;
  }

  // ────────────────────────────────────────────
  // 内部: サイクル
  // ────────────────────────────────────────────

  private async runCycle(myEpoch: number, latestUserUtterance: string) {
    const command = await this.brain.tick({
      turnIndex: myEpoch,
      recentTurns: this.turns,
      latestUserUtterance,
    });
    this.emit({ type: "brain_command", command });

    if (!this.isCurrent(myEpoch)) return;

    await this.executeCommand(command, myEpoch, latestUserUtterance);
  }

  private isCurrent(myEpoch: number): boolean {
    return !this.closed && this.epoch === myEpoch;
  }

  private async executeCommand(
    command: BrainCommand,
    myEpoch: number,
    latestUserUtterance: string
  ) {
    switch (command.type) {
      case "stay":
        await this.openSpeaker(myEpoch);
        return;

      case "inject_hint":
        this.speaker.injectSystemNote(`💡 ${command.note}`);
        await this.openSpeaker(myEpoch);
        return;

      case "switch_node": {
        const node = this.findNode(command.nodeId);
        this.endCallAllowed = node?.type === "end";
        const directive = command.directive?.trim()
          ? command.directive
          : this.lookupDirectiveFor(command.nodeId);
        if (directive) {
          this.speaker.injectSystemNote(`📍 ${directive}`);
        }
        if (node && this.isKnowledgeAction(node)) {
          const injection = await this.executeKnowledgeLookup(
            node,
            command.query?.trim() || latestUserUtterance
          );
          if (!this.isCurrent(myEpoch)) return;
          if (injection) this.speaker.injectSystemNote(injection);
        }
        await this.openSpeaker(myEpoch);
        return;
      }

      case "wait_heavy":
        if (command.fillerUtterance && command.fillerUtterance.trim()) {
          this.speaker.injectAssistantUtterance(command.fillerUtterance.trim());
        } else {
          // フィラーが無いと Speaker が完全に黙ってしまうため、せめて通常応答は開く
          await this.openSpeaker(myEpoch);
        }
        return;

      case "end_call":
        this.markEndCallAllowed();
        this.speaker.injectSystemNote(
          `🛑 通話を終了してください。「${this.compiled.defaultEndMessage}」と伝えて end_call ツールを呼んでください。`
        );
        await this.openSpeaker(myEpoch);
        return;
    }
  }

  private lookupDirectiveFor(nodeId: string): string {
    const node = this.findNode(nodeId);
    return node?.speakerDirective ?? "";
  }

  private async executeKnowledgeLookup(
    node: BrainFlowNode,
    query: string
  ): Promise<string | null> {
    const action = node.action;
    if (!action || (action.type !== "faq" && action.type !== "rag")) return null;
    if (this.knowledgeLookups.has(node.id)) return null;
    this.knowledgeLookups.add(node.id);

    const tool = action.type === "faq" ? "lookup_faq" : "lookup_documents";
    const effectiveQuery = query.trim();
    if (!effectiveQuery) {
      return `🔎 [${tool} 該当なし] 検索語が空です。お客様に確認してください。`;
    }

    const call = {
      callId: `director-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: tool,
      arguments: JSON.stringify({ query: effectiveQuery }),
    };
    const ctx = this.buildToolContext(node);
    const args = this.safeParseJson(call.arguments);
    logToolNodeEntry(this.logger, this.tag, call.name, args, this.toolLogContext());
    this.emitToolCall(call);

    try {
      const startedAt = Date.now();
      const result = await this.toolExecutor.execute(
        call,
        ctx
      );
      const elapsed = Date.now() - startedAt;
      logToolNodeResult(this.logger, this.tag, call.name, result.output, elapsed, this.toolLogContext());
      this.emitToolResult({ callId: call.callId, name: call.name, output: result.output });

      const out = result.output as Record<string, unknown>;
      const ok = out.ok !== false;
      const answer = typeof out.answer === "string" ? out.answer.trim() : "";
      this.emit({ type: "brain_tool_executed", tool, query: effectiveQuery, ok });

      if (!ok || !answer) {
        return `🔎 [${tool} 該当なし] 該当情報なし。お客様には「申し訳ありません、こちらでは分かりかねます」と伝えてください。`;
      }

      return `🔎 [${tool} 結果]\n${answer}\n\n上記内容のみを根拠に短く案内してください。`;
    } catch (err) {
      this.logger.warn(`proactive tool ${tool} failed: ${(err as Error).message}`);
      this.emit({ type: "brain_tool_executed", tool, query: effectiveQuery, ok: false });
      return `🔎 [${tool} 実行失敗] お客様に「確認に少し時間がかかります」と伝えてください。`;
    }
  }

  async handleFunctionCall(call: DirectorToolCallEvent) {
    this.emitToolCall(call);

    const node = this.currentNode();
    const args = this.safeParseJson(call.arguments);
    logToolNodeEntry(this.logger, this.tag, call.name, args, this.toolLogContext());

    const denial = this.validateToolAllowed(call.name, node);
    if (denial) {
      const result: ToolExecutionResult = { output: { ok: false, error: denial } };
      this.emitToolResult({
        callId: call.callId,
        name: call.name,
        output: result.output,
      });
      this.speaker.sendFunctionResult(call.callId, result.output);
      this.logger.warn(`${this.tag} tool denied: ${call.name} node=${node?.id ?? "-"} reason=${denial}`);
      return;
    }

    const startedAt = Date.now();
    const result = await this.toolExecutor.execute(call, this.buildToolContext(node));
    const elapsed = Date.now() - startedAt;

    logToolNodeResult(this.logger, this.tag, call.name, result.output, elapsed, this.toolLogContext());
    this.logger.debug(
      `${this.tag} 🛠 TOOL result raw: ${call.name} (${elapsed}ms) ` +
        `output=${summarizeForLog(result.output)} ` +
        `sideEffect=${result.sideEffect ? JSON.stringify(result.sideEffect) : "-"}`
    );

    if (call.name === "submit_collected_info") {
      const fields = (result.output as Record<string, unknown>).fields as
        | Record<string, string>
        | undefined;
      if (fields) this.brain.syncCollectedFields(fields);
    }

    this.emitToolResult({
      callId: call.callId,
      name: call.name,
      output: result.output,
      sideEffect: result.sideEffect,
    });
    this.speaker.sendFunctionResult(call.callId, result.output);

    if (result.sideEffect?.kind === "transfer") {
      try {
        await this.onTransferRequested?.(result.sideEffect.to, result.sideEffect.reason);
      } catch (err) {
        this.logger.error(`${this.tag} transfer failed: ${(err as Error).message}`);
      }
    } else if (result.sideEffect?.kind === "end_call") {
      this.onEndCallRequested?.(result.sideEffect.reason);
    }
  }

  private findNode(nodeId: string) {
    return this.compiled.brainFlow.nodes.find((node) => node.id === nodeId) ?? null;
  }

  private currentNode() {
    return this.findNode(this.brain.state.currentNodeId);
  }

  private isKnowledgeAction(node: BrainFlowNode) {
    return node.action?.type === "faq" || node.action?.type === "rag";
  }

  private buildToolContext(node: BrainFlowNode | null): ToolContext {
    return {
      companyId: this.context.companyId,
      callSessionId: this.context.callSessionId,
      callFlowId: this.context.callFlowId,
      callerNumber: this.context.callerNumber,
      defaults: this.context.defaults,
      ragPrecision: this.compiled.ragPrecision,
      activeAction: node?.action
        ? {
            nodeId: node.id,
            type: node.action.type,
            fields: node.action.fields,
            target: node.action.target,
          }
        : undefined,
    };
  }

  private validateToolAllowed(toolName: string, node: BrainFlowNode | null) {
    switch (toolName) {
      case "transfer_call":
        return node?.action?.type === "transfer"
          ? null
          : "transfer_call is only allowed on transfer action nodes";
      case "send_notification":
        return node?.action?.type === "notify"
          ? null
          : "send_notification is only allowed on notify action nodes";
      case "submit_collected_info":
        return node?.action?.type === "collect"
          ? null
          : "submit_collected_info is only allowed on collect action nodes";
      case "end_call":
        return node?.type === "end" || this.endCallAllowed
          ? null
          : "end_call is only allowed on end nodes";
      case "lookup_faq":
      case "lookup_documents":
        return "knowledge lookup tools are reserved for Director";
      default:
        return `unknown tool: ${toolName}`;
    }
  }

  private markEndCallAllowed() {
    this.endCallAllowed = true;
  }

  private toolLogContext() {
    return {
      ragPrecision: this.compiled.ragPrecision,
      transferTo: this.context.defaults.transferTo,
      notifyTarget: this.context.defaults.notifyTarget,
    };
  }

  private safeParseJson(raw: string): Record<string, unknown> {
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  private emitToolResult(event: DirectorToolResultEvent) {
    try {
      this.onToolResult?.(event);
    } catch (err) {
      this.logger.warn(`Director tool observer threw: ${(err as Error).message}`);
    }
  }

  private emitToolCall(event: DirectorToolCallEvent) {
    try {
      this.onToolCall?.(event);
    } catch (err) {
      this.logger.warn(`Director tool observer threw: ${(err as Error).message}`);
    }
  }

  private async openSpeaker(myEpoch: number) {
    if (this.postBrainPauseMs > 0) {
      await this.delay(this.postBrainPauseMs);
    }
    if (!this.isCurrent(myEpoch)) return;
    this.speaker.createResponse();
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private emit(event: DirectorObserverEvent) {
    try {
      this.onEvent?.(event);
    } catch (err) {
      this.logger.warn(`Director observer threw: ${(err as Error).message}`);
    }
  }
}
