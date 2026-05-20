import { Injectable, Logger } from "@nestjs/common";
import { BrainFlow, CompiledFlowV2 } from "../call-flows/flow-compiler.service";
import {
  BRAIN_COMMAND_JSON_SCHEMA,
  BrainCommand,
  BrainState,
  BrainTickInput,
  BrainTurn,
} from "./supervisor-types";

// ─────────────────────────────────────────────────────────────
// SupervisorService (Brain)
//
// 通話 1 回ごとに createSession() で BrainSession を生成し、
// 毎ユーザー発話完了時に session.tick(input) を呼ぶ。
// tick は OpenAI Chat Completions API を structured outputs モードで
// 叩いて BrainCommand を返す。
//
// 設計のポイント:
//  - Brain は通話の current node を完全に所有する。アプリ側コードは
//    Brain.state.currentNodeId を読むだけで、書き換えは Brain 経由でしか行わない。
//  - レスポンスは strict JSON schema で固定。パース失敗時は "stay" にフォールバック。
//  - tick の実行は LLM 呼び出しを含むため数百 ms 〜 1 秒掛かる。Director が
//    Speaker の response.create をゲートしている前提。
// ─────────────────────────────────────────────────────────────

const DEFAULT_BRAIN_MODEL = "gpt-4o-mini";
const BRAIN_TICK_TIMEOUT_MS = 4000;
const BRAIN_MAX_RECENT_TURNS = 10;

export interface BrainSessionConfig {
  /** 通話セッション ID（ログ用） */
  callSessionId: string | null;
  /** Brain LLM のモデル名（Company.brainModel から渡される） */
  model: string;
  /** コンパイル済みフロー（Brain がフロー構造を理解するために必要） */
  compiled: CompiledFlowV2;
}

@Injectable()
export class SupervisorService {
  private readonly logger = new Logger(SupervisorService.name);
  private readonly apiKey = process.env.OPENAI_API_KEY ?? "";

  /** 通話 1 本分の Brain セッションを生成する。 */
  createSession(config: BrainSessionConfig): BrainSession {
    const effectiveModel =
      config.model || process.env.OPENAI_BRAIN_MODEL || DEFAULT_BRAIN_MODEL;
    return new BrainSession(
      this.logger,
      this.apiKey,
      effectiveModel,
      config.callSessionId,
      config.compiled
    );
  }
}

export class BrainSession {
  readonly state: BrainState;

  constructor(
    private readonly logger: Logger,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly callSessionId: string | null,
    private readonly compiled: CompiledFlowV2
  ) {
    this.state = {
      currentNodeId: compiled.brainFlow.startNodeId,
      visitedNodeIds: [compiled.brainFlow.startNodeId],
      collectedFields: {},
      lastProcessedTurnIndex: -1,
      consecutiveStayCount: 0,
    };
  }

  private get tag(): string {
    return `[brain ${this.callSessionId ?? "no-session"}]`;
  }

  /** Brain にユーザー発話を観測させ、次の指示を決めさせる。 */
  async tick(input: BrainTickInput): Promise<BrainCommand> {
    // 重複 tick（同じユーザー発話で複数回呼ばれた場合）はスキップ
    if (input.turnIndex <= this.state.lastProcessedTurnIndex) {
      this.logger.debug(`${this.tag} skip duplicate tick turnIndex=${input.turnIndex}`);
      return { type: "stay", reasoning: "duplicate tick skipped" };
    }
    this.state.lastProcessedTurnIndex = input.turnIndex;

    if (!this.apiKey) {
      this.logger.warn(`${this.tag} OPENAI_API_KEY missing → fallback stay`);
      return { type: "stay", reasoning: "no api key" };
    }

    const startedAt = Date.now();
    try {
      const command = await this.callBrainLLM(input);
      const elapsed = Date.now() - startedAt;

      // LLM の応答中に新しい tick が走り始めていたら、この結果は stale。
      // 古い判断で state (currentNodeId, visitedNodeIds) を書き換えないよう applyCommand を抑止する。
      if (input.turnIndex < this.state.lastProcessedTurnIndex) {
        this.logger.debug(
          `${this.tag} 🧠 stale tick ${input.turnIndex} (latest=${this.state.lastProcessedTurnIndex}) discarded`
        );
        return { type: "stay", reasoning: "stale tick" };
      }

      this.applyCommand(command);
      this.logger.log(
        `${this.tag} 🧠 ${command.type} (${elapsed}ms) node=${this.state.currentNodeId} ` +
          `reason="${(command.reasoning ?? "").slice(0, 80)}"`
      );
      return command;
    } catch (err) {
      const elapsed = Date.now() - startedAt;
      this.logger.warn(
        `${this.tag} 🧠 tick failed (${elapsed}ms): ${(err as Error).message} → fallback stay`
      );
      return { type: "stay", reasoning: "brain llm failed" };
    }
  }

  /** Brain が判断した結果を state に反映する。 */
  private applyCommand(command: BrainCommand) {
    if (command.type === "stay") {
      this.state.consecutiveStayCount += 1;
    } else {
      this.state.consecutiveStayCount = 0;
    }

    if (command.type === "switch_node") {
      const exists = this.compiled.brainFlow.nodes.some((n) => n.id === command.nodeId);
      if (exists && command.nodeId !== this.state.currentNodeId) {
        this.state.currentNodeId = command.nodeId;
        this.state.visitedNodeIds.push(command.nodeId);
      } else if (!exists) {
        this.logger.warn(
          `${this.tag} switch_node to unknown nodeId=${command.nodeId} → ignored`
        );
      }
    }
  }

  /** ToolExecutor が submit_collected_info を処理した結果を Brain に同期する。 */
  syncCollectedFields(fields: Record<string, string>) {
    this.state.collectedFields = { ...this.state.collectedFields, ...fields };
  }

  // ────────────────────────────────────────────
  // LLM 呼び出し
  // ────────────────────────────────────────────

  private async callBrainLLM(input: BrainTickInput): Promise<BrainCommand> {
    const messages = this.buildMessages(input);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BRAIN_TICK_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: BRAIN_COMMAND_JSON_SCHEMA,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Brain LLM ${response.status}: ${errText.slice(0, 200)}`);
      }

      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      const raw = body.choices?.[0]?.message?.content ?? "";
      return this.parseBrainCommand(raw);
    } finally {
      clearTimeout(timer);
    }
  }

  private parseBrainCommand(raw: string): BrainCommand {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.logger.warn(`${this.tag} brain output not JSON: ${raw.slice(0, 200)}`);
      return { type: "stay", reasoning: "non-json output" };
    }

    const type = parsed.type as string;
    const reasoning = (parsed.reasoning as string | null) ?? undefined;

    switch (type) {
      case "stay":
        return { type: "stay", reasoning };
      case "inject_hint": {
        const note = (parsed.note as string | null) ?? "";
        if (!note.trim()) return { type: "stay", reasoning: "inject_hint with empty note" };
        return { type: "inject_hint", note: note.slice(0, 240), reasoning };
      }
      case "switch_node": {
        const nodeId = (parsed.nodeId as string | null) ?? "";
        const directive = (parsed.directive as string | null) ?? "";
        const query = (parsed.query as string | null) ?? "";
        if (!nodeId) return { type: "stay", reasoning: "switch_node without nodeId" };
        return {
          type: "switch_node",
          nodeId,
          directive,
          query: query.slice(0, 500),
          reasoning,
        };
      }
      case "wait_heavy":
        return {
          type: "wait_heavy",
          fillerUtterance:
            (parsed.fillerUtterance as string | null) ?? undefined,
          reasoning,
        };
      case "end_call": {
        const endNode = this.compiled.brainFlow.nodes.find((node) => node.type === "end");
        if (endNode) {
          return {
            type: "switch_node",
            nodeId: endNode.id,
            directive: endNode.speakerDirective,
            query: "",
            reasoning,
          };
        }
        return { type: "end_call", reasoning };
      }
      default:
        this.logger.warn(`${this.tag} unknown brain command type=${type}`);
        return { type: "stay", reasoning: `unknown type ${type}` };
    }
  }

  private buildMessages(input: BrainTickInput) {
    return [
      {
        role: "system" as const,
        content: this.compiled.brainSystemPrompt,
      },
      {
        role: "user" as const,
        content: [
          "# フロー",
          this.summarizeFlow(this.compiled.brainFlow),
          "",
          "# 状況",
          this.summarizeState(),
          "",
          "# 会話履歴",
          this.formatRecentTurns(input.recentTurns),
          "",
          `# 最新発話: 「${input.latestUserUtterance}」`,
        ].join("\n"),
      },
    ];
  }

  private summarizeFlow(flow: BrainFlow): string {
    return flow.nodes
      .map((node) => {
        const edges =
          node.edges.length === 0
            ? "  → (出口なし)"
            : node.edges
                .map((edge) => {
                  const cond = edge.whenSaid ? `「${edge.whenSaid}」なら` : "";
                  return `  → ${edge.targetNodeId}${cond ? ` (${cond})` : ""}`;
                })
                .join("\n");
        return `- ${node.id} [${node.type}] ${node.brief}\n${edges}`;
      })
      .join("\n");
  }

  private summarizeState(): string {
    const fields = Object.entries(this.state.collectedFields);
    const fieldsStr =
      fields.length === 0
        ? "(未収集)"
        : fields.map(([k, v]) => `${k}=「${v}」`).join(", ");
    const visited = this.state.visitedNodeIds.slice(-6).join(" → ");
    return [
      `- 現在ノード: ${this.state.currentNodeId}`,
      `- 通過履歴(直近6): ${visited}`,
      `- 収集済み: ${fieldsStr}`,
      `- 連続stay回数: ${this.state.consecutiveStayCount}`,
    ].join("\n");
  }

  private formatRecentTurns(turns: BrainTurn[]): string {
    if (turns.length === 0) return "(まだ会話がありません)";
    return turns
      .slice(-BRAIN_MAX_RECENT_TURNS)
      .map((turn) => {
        const who = turn.speaker === "USER" ? "お客様" : "応対AI";
        return `${who}: ${turn.text}`;
      })
      .join("\n");
  }
}
