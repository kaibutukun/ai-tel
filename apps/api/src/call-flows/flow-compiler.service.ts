import { Injectable, Logger } from "@nestjs/common";
import {
  ActionNodeData,
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
// FlowCompilerService
//
// CallFlow.flowJson (React Flow の nodes/edges) を、OpenAI Realtime API に
// 渡す「instructions（システムプロンプト）」と「tools（関数）」に変換する。
//
// 設計方針:
//   - LLM がマスター、フローは "あらすじ"。
//   - ノードは「補足発話」「ツール呼び出し」「分岐ヒント」「終了」のいずれかとして文章化する。
//   - ツール (book_appointment / transfer_call / send_notification /
//     lookup_faq / lookup_documents) はフローに登場する actionType に応じて
//     動的に露出する。
// ─────────────────────────────────────────────────────────────

export interface CompiledFlow {
  /** OpenAI Realtime session.update に渡す instructions */
  instructions: string;
  /** OpenAI Realtime tools 定義 */
  tools: RealtimeTool[];
  /** 情報収集ノードごとの必須項目。ツール実行時の不足チェックに使う。 */
  collectRequirements: CollectRequirement[];
  /** 開幕で固定発話するメッセージ（あれば最初に conversation.item.create で注入） */
  openingLockedMessage: string | null;
  /** デフォルトの終了メッセージ（end ノード未到達時のフォールバック） */
  defaultEndMessage: string;
  /** rag ノードの精度設定（複数あれば最も低い = 最も網羅的なものを採用） */
  ragPrecision: number;
}

export interface CollectRequirement {
  nodeId: string;
  fields: string[];
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

  /**
   * flowJson を Realtime API 用にコンパイル。
   * 不正な JSON や空フローでも落ちないようフォールバック付き。
   */
  compile(flowJson: unknown, flowName?: string | null): CompiledFlow {
    if (!isFlowGraph(flowJson)) {
      this.logger.warn("flowJson invalid or missing — using empty fallback flow");
      return this.emptyFlow(flowName);
    }
    return this.compileGraph(flowJson, flowName);
  }

  // ────────────────────────────────────────────
  // 内部実装
  // ────────────────────────────────────────────

  private compileGraph(graph: FlowGraph, flowName?: string | null): CompiledFlow {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const outgoing = this.buildOutgoingMap(graph.edges);

    // 開幕の固定メッセージ: start から辿って最初に出会う "locked" な message
    const startNode = graph.nodes.find((n) => n.type === "start");
    const openingLockedMessage = startNode
      ? this.findOpeningLockedMessage(startNode, nodeById, outgoing)
      : null;

    // フロー本文の文章化
    const sections: string[] = [];
    sections.push(this.buildHeader(flowName));
    const basicInfo = this.buildBasicInfo(graph.basicInfo);
    if (basicInfo) sections.push(basicInfo);
    sections.push(this.buildGuidance(graph));
    sections.push(this.buildFlowOutline(graph, outgoing));

    // 終了メッセージ（最後に到達する end ノードのものを採用、なければ汎用文）
    const endNodes = graph.nodes.filter((n) => n.type === "end");
    const defaultEndMessage =
      (endNodes[0]?.data as EndNodeData | undefined)?.endMessage ||
      "お電話ありがとうございました。";

    // FAQ/RAG ノードの精度: 複数あれば最低値（最も網羅的）を採用。
    // 「厳しい設定が混ざってると全体が厳しくなる」のを避けるため。
    const ragPrecision = this.resolveRagPrecision(graph);

    const tools = this.buildTools(graph);
    const collectRequirements = this.buildCollectRequirements(graph);

    return {
      instructions: sections.join("\n\n"),
      tools,
      collectRequirements,
      openingLockedMessage,
      defaultEndMessage,
      ragPrecision,
    };
  }

  private emptyFlow(flowName?: string | null): CompiledFlow {
    return {
      instructions: [
        this.buildHeader(flowName),
        this.buildGuidance(),
        "【台本】\n  特に定義されていません。お客様の用件を伺い、自然に応対してください。",
      ].join("\n\n"),
      tools: [this.toolEndCall()],
      collectRequirements: [],
      openingLockedMessage: null,
      defaultEndMessage: "お電話ありがとうございました。",
      ragPrecision: RAG_PRECISION_DEFAULT,
    };
  }

  /** instructions のヘッダー（役割定義） */
  private buildHeader(flowName?: string | null): string {
    return [
      "あなたは電話オペレーターのAIアシスタントです。",
      flowName ? `現在の対応フロー: ${flowName}` : "",
      "音声通話なので、自然で短めの口語で、敬語を使って応対してください。",
      "句読点ごとに区切らず、息継ぎのリズムで話してください。",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildBasicInfo(value?: string | string[]): string | null {
    const raw = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    const cleaned = raw?.trim().slice(0, 30);
    if (!cleaned) return null;

    return [
      "【AIの基本情報】",
      cleaned,
      "この内容を前提に、通話中は自然に応対してください。",
    ].join("\n");
  }

  /** instructions の共通ガイドライン */
  private buildGuidance(graph?: FlowGraph): string {
    const hasFaq = graph?.nodes.some(
      (n) => n.type === "action" && (n.data as ActionNodeData).actionType === "faq"
    );
    const hasCollect = graph?.nodes.some(
      (n) => n.type === "action" && (n.data as ActionNodeData).actionType === "collect"
    );
    const hasNotify = graph?.nodes.some(
      (n) => n.type === "action" && (n.data as ActionNodeData).actionType === "notify"
    );
    return [
      "【会話のルール】",
      "- 普通に会話してください。以下の台本は厳密な手順ではなく、おおまかな進行の指針です。",
      "- ただし、台本にあるアクションノードは会話だけで済ませず、対応するツールを必ず使ってください。",
      "- お客様が予期しない話題に逸れたら、まずその発話に自然に応答し、流れを見て本題に戻してください。",
      "- 複数の質問が一度に来た場合は、ひとつずつ順番に答えてください。",
      hasFaq
        ? "- 予約方法、営業時間、キャンセル、支払い、アクセスなど、登録FAQで答えられそうな質問を受けた場合は、一般知識や推測で答える前に必ず lookup_faq ツールで確認してください。ツール結果に answer がある場合はその内容だけを短く案内してください。"
        : "",
      hasCollect
        ? "- 予約、申込、折り返しなどの情報収集に入ったら、聞き取れた項目を submit_collected_info ツールで保存してください。missingFields が返った場合は、不足項目だけを一つずつ聞いてください。「適当」「いつでも」「なんでも」など曖昧な値は確定情報として扱わず、具体的な希望を聞き直してください。"
        : "",
      hasNotify
        ? "- 情報収集が完了した後に通知ノードへ進む場合は、send_notification ツールを使って担当者へ内容を送ってください。"
        : "",
      "- 「人と話したい」「担当者に代わって」と求められたら、ためらわず transfer_call ツールで取り次いでください。",
      "- 不明な質問には推測で答えず、「申し訳ありません、こちらでは分かりかねます」と素直に伝えてください。",
      "- 通話を終える時は end_call ツールを呼んでください。",
    ].filter(Boolean).join("\n");
  }

  /**
   * フロー全体を「進行台本」として自然言語化する。
   * start から幅優先で辿りつつ、ノード種別ごとに記述を分岐。
   */
  private buildFlowOutline(graph: FlowGraph, outgoing: Map<string, FlowEdge[]>): string {
    const lines: string[] = ["【台本（おおまかな進行）】"];
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const visited = new Set<string>();
    const startNode = graph.nodes.find((n) => n.type === "start");
    if (!startNode) {
      lines.push("  （スタートノードが見つかりません）");
      return lines.join("\n");
    }

    // BFS で順序を確定
    const order: FlowNode[] = [];
    const queue: string[] = [startNode.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = nodeById.get(id);
      if (!node) continue;
      order.push(node);
      const next = outgoing.get(id) || [];
      for (const edge of next) {
        if (!visited.has(edge.target)) queue.push(edge.target);
      }
    }

    for (const node of order) {
      const block = this.describeNode(node, outgoing.get(node.id) || []);
      if (block) lines.push(block);
    }

    return lines.join("\n");
  }

  private describeNode(node: FlowNode, edges: FlowEdge[]): string | null {
    switch (node.type) {
      case "start":
        return "  [開始] 着信に応答します。";

      case "message": {
        const d = node.data as MessageNodeData;
        if (!d.message) return null;
        if (d.strictness === "locked") {
          // 一字一句固定のメッセージは別途 conversation.item.create で注入する想定だが、
          // 台本にも明記しておく（LLM が文脈で読んでくれる）。
          return `  [固定発話] このタイミングで必ず次の文をそのまま発話: 「${d.message}」`;
        }
        return `  [伝えたい内容] ${d.message}（言い回しは状況に合わせて調整可）`;
      }

      case "condition": {
        const d = node.data as ConditionNodeData;
        const desc = d.description ? ` (${d.description})` : "";
        const lines = [`  [分岐${desc}] 会話の流れから次のいずれかに進む:`];
        const conds = d.conditions || [];
        conds.forEach((cond, i) => {
          const matchedEdge = edges.find(
            (e) => e.sourceHandle === `cond-${i}` || e.label === cond
          );
          const next = matchedEdge?.target ?? "（未接続）";
          lines.push(`    - 「${cond}」なら → ${next}`);
        });
        return lines.join("\n");
      }

      case "action": {
        const d = node.data as ActionNodeData;
        const label = this.actionLabel(d.actionType);
        switch (d.actionType) {
          case "transfer":
            return `  [アクション: 転送] 担当者 (${d.target || "未設定"}) に通話を取り次ぐ。transfer_call ツールを使用。`;
          case "notify":
            return `  [アクション: 通知] (${d.target || "未設定"}) へ通知。send_notification ツールを使用。`;
          case "collect": {
            const fields = (d.fields || []).filter(Boolean).join("・");
            return `  [アクション: 情報収集] 次の項目を聞き取る: ${fields || "（未設定）"}。聞き取れた項目は submit_collected_info で保存し、不足項目が返ってきたら次の不足項目を聞く。すべて埋まるまで次へ進まない。`;
          }
          case "faq":
            return `  [アクション: ${label}] お客様の質問を query にして必ず lookup_faq ツールで登録FAQを参照してから回答。該当なしなら推測せず、その旨を伝える。`;
          case "rag":
            return `  [アクション: ${label}] 必要なら lookup_documents ツールで資料を参照して回答。`;
          default:
            return `  [アクション: ${label}]`;
        }
      }

      case "end": {
        const d = node.data as EndNodeData;
        return `  [終了] 「${d.endMessage || "お電話ありがとうございました。"}」と伝えて end_call ツールで通話を終える。`;
      }

      default:
        return null;
    }
  }

  private actionLabel(t: ActionNodeData["actionType"]): string {
    return (
      { faq: "FAQ回答", rag: "資料検索", transfer: "転送", notify: "通知送信", collect: "情報収集" }[
        t
      ] || t
    );
  }

  /** 各ノード ID → そこから出ているエッジ群 のマップ */
  private buildOutgoingMap(edges: FlowEdge[]): Map<string, FlowEdge[]> {
    const map = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    }
    return map;
  }

  /**
   * start から最初の "locked" なメッセージノードを探す。
   * 経路上の他ノードに「locked でない発話」が挟まる前のものだけを開幕固定とみなす。
   */
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
        return null; // locked じゃない発話があれば打ち切り
      }
      const next = outgoing.get(current.id);
      if (!next || next.length === 0) return null;
      current = nodeById.get(next[0].target);
    }
    return null;
  }

  /** FAQ/RAG ノードの precision を集約。複数あれば最低値、無ければ既定値。 */
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

  private buildCollectRequirements(graph: FlowGraph): CollectRequirement[] {
    return graph.nodes
      .filter((n) => n.type === "action" && (n.data as ActionNodeData).actionType === "collect")
      .map((n) => ({
        nodeId: n.id,
        fields: ((n.data as ActionNodeData).fields || [])
          .map((field) => field.trim())
          .filter(Boolean),
      }))
      .filter((requirement) => requirement.fields.length > 0);
  }

  // ────────────────────────────────────────────
  // ツール定義
  // ────────────────────────────────────────────

  private buildTools(graph: FlowGraph): RealtimeTool[] {
    const tools: RealtimeTool[] = [this.toolEndCall()];

    // フローで使われている actionType に応じてツールを露出
    const usedActions = new Set<string>();
    for (const node of graph.nodes) {
      if (node.type === "action") {
        usedActions.add((node.data as ActionNodeData).actionType);
      }
    }

    if (usedActions.has("transfer")) tools.push(this.toolTransferCall());
    if (usedActions.has("notify")) tools.push(this.toolSendNotification());
    if (usedActions.has("collect")) tools.push(this.toolSubmitCollected());
    if (usedActions.has("faq")) tools.push(this.toolLookupFaq());
    if (usedActions.has("rag")) tools.push(this.toolLookupDocuments());

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
          reason: {
            type: "string",
            description: "終了理由を簡潔に（例: 用件完了 / 折り返し希望）",
          },
        },
        additionalProperties: false,
      },
    };
  }

  private toolTransferCall(): RealtimeTool {
    return {
      type: "function",
      name: "transfer_call",
      description:
        "通話を担当者へ転送する。お客様が人と話したい場合、または台本で転送指示が出た場合に呼ぶ。",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "転送先電話番号（省略時は台本の既定値を使用）",
          },
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
          target: {
            type: "string",
            description: "通知先（メールアドレス等）。省略時は台本の既定値を使用",
          },
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
      description:
        "情報収集シーンで聞き取った内容を保存する。部分的に聞き取れた時点でも呼べる。結果の missingFields が空になるまで次のノードへ進まない。",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "object",
            description: "聞き取った項目名と値のペア（例: {お名前: '山田太郎', 連絡先: '090-...' })",
            additionalProperties: { type: "string" },
          },
        },
        required: ["fields"],
        additionalProperties: false,
      },
    };
  }

  private toolLookupFaq(): RealtimeTool {
    return {
      type: "function",
      name: "lookup_faq",
      description:
        "社内に登録された FAQ を検索する。お客様の質問に近いものを探したいときに使う。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "検索クエリ（ユーザーの質問を要約）" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    };
  }

  private toolLookupDocuments(): RealtimeTool {
    return {
      type: "function",
      name: "lookup_documents",
      description: "登録された参考資料を検索する。FAQ では答えきれない詳細質問のときに使う。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "検索クエリ" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    };
  }
}
