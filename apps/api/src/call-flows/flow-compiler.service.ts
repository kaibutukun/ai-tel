import { Injectable, Logger } from "@nestjs/common";
import {
  ActionNodeData,
  ActionType,
  ConditionNodeData,
  EndNodeData,
  FlowEdge,
  FlowGraph,
  FlowNode,
  MessageNodeData,
  RAG_PRECISION_DEFAULT,
  isFlowGraph,
} from "./flow-types";

// ─────────────────────────────────────────────────────────────
// FlowCompilerService (v2)
//
// CallFlow.flowJson を 2 種類の AI に渡せる形式にコンパイルする。
//
//  - Speaker (Realtime AI) には「短い役割定義」+「ツール定義」だけ渡す。
//    フロー全体は知らせず、Director 経由で system note を注入して
//    その時々の指示を受ける形にする。
//  - Brain (Supervisor) には「構造化されたフロー」+「ノード説明」を渡す。
//    Brain は会話履歴と突き合わせて、Speaker に何をさせるべきかを判断する。
//
// 設計思想: 通話中の「現在ノード」は Brain が完全に管理する。
// ─────────────────────────────────────────────────────────────

export interface CompiledFlowV2 {
  /** Speaker (Realtime AI) 用の short system prompt */
  speakerSystemPrompt: string;
  /** Speaker が使えるツール定義 */
  speakerTools: RealtimeTool[];

  /** Brain (Supervisor) 用の system prompt */
  brainSystemPrompt: string;
  /** Brain が監督する対象のフロー構造 */
  brainFlow: BrainFlow;

  /** 開幕の固定発話。Speaker に喋らせる文 */
  openingMessage: string;
  /** end ノード未到達でのフォールバック終了文 */
  defaultEndMessage: string;
  /** RAG/FAQ ノードの精度設定（複数あれば最低値） */
  ragPrecision: number;
  /** AI の基本情報（人格・背景） */
  basicInfo: string | null;
  /** フロー名（ログ用） */
  flowName: string | null;
}

export interface BrainFlow {
  startNodeId: string;
  nodes: BrainFlowNode[];
}

export interface BrainFlowNode {
  id: string;
  type: BrainFlowNodeType;
  /** 一行説明。Brain が読みやすい自然言語 */
  brief: string;
  /** Speaker に渡すべき指示文（switch_node 時に system note として注入） */
  speakerDirective: string;
  /** 次に進める候補ノード ID と、その分岐条件 */
  edges: BrainFlowEdge[];
  /** action ノード特有の情報（あれば） */
  action?: {
    type: ActionType;
    fields?: string[];
    target?: string;
  };
}

export type BrainFlowNodeType = "start" | "message" | "condition" | "action" | "end";

export interface BrainFlowEdge {
  targetNodeId: string;
  /** condition ノードの分岐ラベル等。なければ無条件遷移 */
  whenSaid?: string;
}

export interface RealtimeTool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

@Injectable()
export class FlowCompilerService {
  private readonly logger = new Logger(FlowCompilerService.name);

  compile(flowJson: unknown, flowName?: string | null): CompiledFlowV2 {
    if (!isFlowGraph(flowJson)) {
      this.logger.warn("flowJson invalid or missing — using empty fallback flow");
      return this.emptyFlow(flowName);
    }
    return this.compileGraph(flowJson, flowName);
  }

  // ────────────────────────────────────────────
  // 内部実装
  // ────────────────────────────────────────────

  private compileGraph(graph: FlowGraph, flowName?: string | null): CompiledFlowV2 {
    const outgoing = this.buildOutgoingMap(graph.edges);
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

    const startNode = graph.nodes.find((n) => n.type === "start");
    const startNodeId = startNode?.id ?? graph.nodes[0]?.id ?? "start";

    const openingMessage =
      (startNode ? this.findOpeningLockedMessage(startNode, nodeById, outgoing) : null) ??
      "お電話ありがとうございます。ご用件をお伺いします。";

    const endNodes = graph.nodes.filter((n) => n.type === "end");
    const defaultEndMessage =
      (endNodes[0]?.data as EndNodeData | undefined)?.endMessage ||
      "お電話ありがとうございました。";

    const ragPrecision = this.resolveRagPrecision(graph);
    const speakerTools = this.buildTools(graph);
    const basicInfo = this.normalizeBasicInfo(graph.basicInfo);

    const brainFlow = this.compileBrainFlow(graph, startNodeId, outgoing);

    return {
      speakerSystemPrompt: this.buildSpeakerSystemPrompt(flowName, basicInfo),
      speakerTools,
      brainSystemPrompt: this.buildBrainSystemPrompt(flowName, basicInfo),
      brainFlow,
      openingMessage,
      defaultEndMessage,
      ragPrecision,
      basicInfo,
      flowName: flowName ?? null,
    };
  }

  private emptyFlow(flowName?: string | null): CompiledFlowV2 {
    return {
      speakerSystemPrompt: this.buildSpeakerSystemPrompt(flowName, null),
      speakerTools: [this.toolEndCall()],
      brainSystemPrompt: this.buildBrainSystemPrompt(flowName, null),
      brainFlow: {
        startNodeId: "start",
        nodes: [
          {
            id: "start",
            type: "start",
            brief: "通話開始（フロー未定義）",
            speakerDirective: "フローが未定義です。お客様の用件を伺い、自然に応対してください。",
            edges: [],
          },
        ],
      },
      openingMessage: "お電話ありがとうございます。ご用件をお伺いします。",
      defaultEndMessage: "お電話ありがとうございました。",
      ragPrecision: RAG_PRECISION_DEFAULT,
      basicInfo: null,
      flowName: flowName ?? null,
    };
  }

  // ────────────────────────────────────────────
  // Speaker 用 system prompt
  // 挙動の強制 (黙る、割り込まない等) はコード側で担保するので、
  // プロンプトでは役割と「監督役の指示には従う」だけを伝える。
  // ────────────────────────────────────────────
  private buildSpeakerSystemPrompt(_flowName: string | null | undefined, basicInfo: string | null): string {
    const lines = [
      "あなたは電話オペレーターのAIです。短い敬語で自然に応対してください。",
      "会話中に system メッセージで監督役から指示が入ります。届いたら指示の通りに動いてください。",
    ];
    if (basicInfo) lines.push(basicInfo);
    return lines.join("\n");
  }

  // ────────────────────────────────────────────
  // Brain 用 system prompt
  // 構造化出力は JSON Schema で強制するので、プロンプトでは役割と
  // 「介入過多にしない」原則だけ伝える。
  // ────────────────────────────────────────────
  private buildBrainSystemPrompt(_flowName: string | null | undefined, basicInfo: string | null): string {
    const lines = [
      "あなたはコールセンターAIの監督役です。応対役（別AI）の裏でフロー図と会話履歴を見て、何をすべきか判断します。",
      "応対役は自然に会話できます。明確に介入が必要な時だけコマンドを返し、それ以外は stay を返してください。",
      "FAQ/資料検索が必要な場合は該当する action ノードへ switch_node し、query に検索語を入れてください。",
      "ツール実行そのものは応対役ではなくシステムが current node に基づいて制御します。",
    ];
    if (basicInfo) lines.push(`応対役の役割設定: ${basicInfo}`);
    return lines.join("\n");
  }

  // ────────────────────────────────────────────
  // Brain 用のフロー構造化
  // ────────────────────────────────────────────
  private compileBrainFlow(
    graph: FlowGraph,
    startNodeId: string,
    outgoing: Map<string, FlowEdge[]>
  ): BrainFlow {
    const nodes: BrainFlowNode[] = graph.nodes.map((node) => {
      const edges = (outgoing.get(node.id) ?? []).map<BrainFlowEdge>((edge, i) => {
        const targetId = edge.target;
        let whenSaid: string | undefined;
        if (node.type === "condition") {
          const conds = (node.data as ConditionNodeData).conditions ?? [];
          const idxMatch = edge.sourceHandle?.match(/^cond-(\d+)$/);
          const idx = idxMatch ? Number(idxMatch[1]) : i;
          whenSaid = edge.label || conds[idx];
        } else if (edge.label) {
          whenSaid = edge.label;
        }
        return { targetNodeId: targetId, whenSaid };
      });

      return {
        id: node.id,
        type: node.type,
        brief: this.describeBriefForBrain(node),
        speakerDirective: this.describeDirectiveForSpeaker(node),
        edges,
        action:
          node.type === "action"
            ? {
                type: (node.data as ActionNodeData).actionType,
                fields: (node.data as ActionNodeData).fields,
                target: (node.data as ActionNodeData).target,
              }
            : undefined,
      };
    });

    return { startNodeId, nodes };
  }

  private describeBriefForBrain(node: FlowNode): string {
    switch (node.type) {
      case "start":
        return "通話開始ノード";
      case "message": {
        const d = node.data as MessageNodeData;
        const tag = d.strictness === "locked" ? "[固定発話]" : "[伝達内容]";
        return `${tag} ${d.message ?? "(空)"}`;
      }
      case "condition": {
        const d = node.data as ConditionNodeData;
        const conds = (d.conditions ?? []).map((c) => `「${c}」`).join(" / ");
        return `[分岐] ${d.description ?? ""} → ${conds || "(条件未設定)"}`;
      }
      case "action": {
        const d = node.data as ActionNodeData;
        const label = this.actionLabel(d.actionType);
        const detail =
          d.actionType === "collect"
            ? `必須項目: ${(d.fields ?? []).join("・")}`
            : d.target
              ? `先: ${d.target}`
              : "";
        return `[アクション: ${label}]${detail ? ` ${detail}` : ""}`;
      }
      case "end": {
        const d = node.data as EndNodeData;
        return `[終了] 「${d.endMessage ?? "お電話ありがとうございました"}」`;
      }
      default:
        return node.type;
    }
  }

  private describeDirectiveForSpeaker(node: FlowNode): string {
    switch (node.type) {
      case "start":
        return "通話を開始します。";
      case "message": {
        const d = node.data as MessageNodeData;
        if (d.strictness === "locked") {
          return `📍 次の文を一字一句そのまま発話してください: 「${d.message ?? ""}」`;
        }
        return `🎯 次のテーマで応対してください: 「${d.message ?? ""}」（言い回しは自然に調整可）`;
      }
      case "condition": {
        const d = node.data as ConditionNodeData;
        return `🎯 ${d.description ?? "会話の流れで判断してください"}`;
      }
      case "action": {
        const d = node.data as ActionNodeData;
        switch (d.actionType) {
          case "transfer":
            return `📍 担当者（${d.target ?? "既定の転送先"}）へ転送します。「担当者へお繋ぎします、少々お待ちください」と伝えてから transfer_call を呼んでください。`;
          case "notify":
            return `🎯 担当者への通知が必要です。必要な内容を短く確認し、send_notification を呼んでください。`;
          case "collect": {
            const fields = (d.fields ?? []).filter(Boolean).join("・");
            return `🎯 情報収集を進めてください。聞き取るべき項目: ${fields || "(未設定)"}。聞き取れた内容を順に確認してください。`;
          }
          case "faq":
            return `🎯 FAQ案件です。システムがFAQ検索結果を渡すので、その内容だけを根拠に短く案内してください。`;
          case "rag":
            return `🎯 詳細な質問への回答が必要です。システムが資料検索結果を渡すので、その内容だけを根拠に短く案内してください。`;
          default: {
            const _exhaustive: never = d.actionType;
            return _exhaustive;
          }
        }
      }
      case "end": {
        const d = node.data as EndNodeData;
        return `🛑 通話を終了してください。「${d.endMessage ?? "お電話ありがとうございました"}」と伝えてから end_call を呼んでください。`;
      }
      default:
        return "";
    }
  }

  private actionLabel(t: ActionType): string {
    return (
      { faq: "FAQ回答", rag: "資料検索", transfer: "転送", notify: "通知送信", collect: "情報収集" }[t] ?? t
    );
  }

  // ────────────────────────────────────────────
  // 共通ヘルパー
  // ────────────────────────────────────────────

  private buildOutgoingMap(edges: FlowEdge[]): Map<string, FlowEdge[]> {
    const map = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    }
    return map;
  }

  private findOpeningLockedMessage(
    start: FlowNode,
    nodeById: Map<string, FlowNode>,
    outgoing: Map<string, FlowEdge[]>
  ): string | null {
    const visited = new Set<string>();
    let current: FlowNode | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.type === "message") {
        const d = current.data as MessageNodeData;
        if (d.strictness === "locked" && d.message) return d.message;
        return null;
      }
      const next = outgoing.get(current.id);
      if (!next || next.length === 0) return null;
      current = nodeById.get(next[0].target);
    }
    return null;
  }

  private resolveRagPrecision(graph: FlowGraph): number {
    const ragNodes = graph.nodes.filter(
      (n) =>
        n.type === "action" &&
        ["faq", "rag"].includes((n.data as ActionNodeData).actionType)
    );
    const values = ragNodes
      .map((n) => (n.data as ActionNodeData).precision)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return RAG_PRECISION_DEFAULT;
    return Math.min(...values);
  }

  private normalizeBasicInfo(value?: string | string[]): string | null {
    const raw = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    const cleaned = raw?.trim().slice(0, 200);
    return cleaned ? cleaned : null;
  }

  // ────────────────────────────────────────────
  // ツール定義（Speaker と Brain で共通カタログ）
  // ────────────────────────────────────────────

  private buildTools(graph: FlowGraph): RealtimeTool[] {
    const tools: RealtimeTool[] = [this.toolEndCall()];
    const usedActions = new Set<ActionType>();
    for (const node of graph.nodes) {
      if (node.type === "action") {
        usedActions.add((node.data as ActionNodeData).actionType);
      }
    }

    if (usedActions.has("transfer")) tools.push(this.toolTransferCall());
    if (usedActions.has("notify")) tools.push(this.toolSendNotification());
    if (usedActions.has("collect")) tools.push(this.toolSubmitCollected());
    return tools;
  }

  private toolEndCall(): RealtimeTool {
    return {
      type: "function",
      name: "end_call",
      description: "通話を終了する。お礼を述べた後に呼ぶこと。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "終了理由を簡潔に" },
        },
        additionalProperties: false,
      },
    };
  }

  private toolTransferCall(): RealtimeTool {
    return {
      type: "function",
      name: "transfer_call",
      description: "通話を担当者へ転送する。",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "転送先電話番号（省略時は既定値）" },
          reason: { type: "string", description: "転送理由" },
        },
        additionalProperties: false,
      },
    };
  }

  private toolSendNotification(): RealtimeTool {
    return {
      type: "function",
      name: "send_notification",
      description: "担当者へ通知を送る（メール/Slack/Webhook等）。",
      parameters: {
        type: "object",
        properties: {
          target: { type: "string", description: "通知先（省略時は既定値）" },
          subject: { type: "string", description: "件名" },
          body: { type: "string", description: "本文" },
        },
        required: ["body"],
        additionalProperties: false,
      },
    };
  }

  private toolSubmitCollected(): RealtimeTool {
    return {
      type: "function",
      name: "submit_collected_info",
      description: "情報収集シーンで聞き取った内容を保存する。",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "聞き取った項目名と値のペア",
            additionalProperties: { type: "string" },
          },
        },
        required: ["fields"],
        additionalProperties: false,
      },
    };
  }

}
