import { Injectable, Logger } from "@nestjs/common";
import {
  ActionNodeData,
  BASIC_INFO_MAX_LENGTH,
  ConditionNodeData,
  DOCUMENT_MIN_SCORE_DEFAULT,
  EndNodeData,
  FAQ_MIN_SCORE_DEFAULT,
  FlowEdge,
  FlowGraph,
  FlowNode,
  MessageNodeData,
  MessageStrictness,
  isFlowGraph,
} from "../domain/flow-types";
import {
  CompiledRuntimeFlow,
  RuntimeNode,
} from "./flow-runtime.types";

/** フロー側に開幕の locked message が無い時、bridge が sayExact で必ず発話するフォールバック。 */
const DEFAULT_OPENING_MESSAGE = "お電話ありがとうございます。";

// ─────────────────────────────────────────────────────────────
// FlowRuntimeCompilerService
//
// CallFlow.flowJson (React Flow の nodes/edges) を、フロー実行エンジンが
// 扱う CompiledRuntimeFlow に変換する。
//
// 旧 FlowCompiler は「Realtime に渡す instructions(進行台本)」を生成する役割
// だったが、新しい設計では Realtime に渡すのは短い役割定義 + ツールだけで、
// フロー構造は FlowEngine が保持し、毎ツール戻り値の snapshot で渡す。
//
// このコンパイラは:
//   - nodes / edges から RuntimeNode マップを作る
//   - 各ノードから到達できる allowedNextNodeIds を解決する
//   - 開幕の locked message を抽出する
//   - FAQ ノードの precision を集約して faqMinScore を決める
//   - 通話設計上の補助情報(basicInfo, defaultEndMessage) を抽出する
// ─────────────────────────────────────────────────────────────

@Injectable()
export class FlowRuntimeCompilerService {
  private readonly logger = new Logger(FlowRuntimeCompilerService.name);

  compile(flowJson: unknown, flowName?: string | null): CompiledRuntimeFlow {
    if (!isFlowGraph(flowJson)) {
      this.logger.warn("flowJson invalid or missing — using empty fallback flow");
      return this.emptyFlow(flowName);
    }
    return this.compileGraph(flowJson, flowName);
  }

  // ────────────────────────────────────────────

  private compileGraph(
    graph: FlowGraph,
    flowName?: string | null
  ): CompiledRuntimeFlow {
    const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
    const outgoing = this.buildOutgoingMap(graph.edges);

    const nodes: Record<string, RuntimeNode> = {};
    for (const node of graph.nodes) {
      nodes[node.id] = this.toRuntimeNode(node, outgoing.get(node.id) ?? []);
    }

    // start ノードが無くても破綻しないように。最初の message ノードを start 扱いで代替する。
    const startNode =
      graph.nodes.find((n) => n.type === "start") ??
      graph.nodes.find((n) => n.type === "message") ??
      null;

    const opening = startNode
      ? this.findOpeningMessage(startNode, nodeById, outgoing)
      : null;

    // 開幕発話後に脳が立つノード。
    // 1) 開幕 message ノードを発話したならその次の interactive ノード
    // 2) それも無ければ start から辿った最初の interactive ノード
    // 3) それも無ければ start ノードそのもの (case "start" の guidance で次へ進ませる)
    const initialCurrentNodeId = startNode
      ? opening
        ? this.firstInteractiveAfter(opening.nodeId, nodeById, outgoing) ??
          opening.nodeId
        : this.firstInteractiveFrom(startNode, nodeById, outgoing) ??
          startNode.id
      : null;

    const endNodes = graph.nodes.filter((n) => n.type === "end");
    const defaultEndMessage =
      (endNodes[0]?.data as EndNodeData | undefined)?.endMessage ||
      "お電話ありがとうございました。";

    const compiled: CompiledRuntimeFlow = {
      flowName: flowName ?? null,
      basicInfo: this.normalizeBasicInfo(graph.basicInfo),
      startNodeId: startNode?.id ?? null,
      // locked / loose 問わず採用するが「sayExact で固定発話」していい根拠として
      // locked のときだけ ID を埋める (将来 loose 発話の挙動を変える余地を残す)。
      openingLockedMessageNodeId:
        opening?.strictness === "locked" ? opening.nodeId : null,
      openingMessage: opening?.message ?? DEFAULT_OPENING_MESSAGE,
      initialCurrentNodeId,
      defaultEndMessage,
      faqMinScore: this.resolveFaqMinScore(graph),
      documentMinScore: DOCUMENT_MIN_SCORE_DEFAULT,
      nodes,
    };

    this.logStructure(graph, compiled);
    return compiled;
  }

  private emptyFlow(flowName?: string | null): CompiledRuntimeFlow {
    return {
      flowName: flowName ?? null,
      basicInfo: null,
      startNodeId: null,
      openingLockedMessageNodeId: null,
      openingMessage: DEFAULT_OPENING_MESSAGE,
      initialCurrentNodeId: null,
      defaultEndMessage: "お電話ありがとうございました。",
      faqMinScore: FAQ_MIN_SCORE_DEFAULT,
      documentMinScore: DOCUMENT_MIN_SCORE_DEFAULT,
      nodes: {},
    };
  }

  private logStructure(graph: FlowGraph, compiled: CompiledRuntimeFlow) {
    const counts = graph.nodes.reduce<Record<string, number>>((acc, n) => {
      const key =
        n.type === "action"
          ? `action(${(n.data as ActionNodeData).actionType ?? "?"})`
          : n.type;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const isolatedIds = graph.nodes
      .filter(
        (n) =>
          (compiled.nodes[n.id]?.allowedNextNodeIds.length ?? 0) === 0 &&
          !graph.edges.some((e) => e.target === n.id) &&
          n.type !== "end"
      )
      .map((n) => n.id);
    this.logger.log(
      `flow structure: nodes=${graph.nodes.length} edges=${graph.edges.length} ` +
        `counts=${JSON.stringify(counts)} ` +
        `startNodeId=${compiled.startNodeId ?? "-"} ` +
        `openingNodeId=${compiled.openingLockedMessageNodeId ?? "-"} ` +
        `initialCurrent=${compiled.initialCurrentNodeId ?? "-"} ` +
        (isolatedIds.length > 0
          ? `⚠ isolated(端から到達できないノード)=[${isolatedIds.join(", ")}]`
          : "")
    );
  }

  private toRuntimeNode(node: FlowNode, edges: FlowEdge[]): RuntimeNode {
    const base: RuntimeNode = {
      id: node.id,
      type: node.type,
      label: (node.data as { label?: string }).label,
      allowedNextNodeIds: edges.map((e) => e.target),
    };

    switch (node.type) {
      case "message": {
        const d = node.data as MessageNodeData;
        base.message = d.message;
        base.strictness = d.strictness ?? "loose";
        break;
      }
      case "condition": {
        const d = node.data as ConditionNodeData;
        base.description = d.description;
        base.branches = (d.conditions ?? []).map((cond, i) => {
          const matched = edges.find(
            (e) => e.sourceHandle === `cond-${i}` || e.label === cond
          );
          return { condition: cond, targetNodeId: matched?.target ?? "" };
        });
        break;
      }
      case "action": {
        const d = node.data as ActionNodeData;
        base.actionType = d.actionType;
        base.fields = (d.fields ?? []).map((f) => f.trim()).filter(Boolean);
        base.target = d.target;
        break;
      }
      case "end": {
        const d = node.data as EndNodeData;
        base.endMessage = d.endMessage;
        break;
      }
      default:
        break;
    }

    return base;
  }

  private normalizeBasicInfo(value?: string | string[]): string | null {
    const raw = Array.isArray(value) ? value.filter(Boolean).join(" ") : value;
    const cleaned = raw?.trim().slice(0, BASIC_INFO_MAX_LENGTH);
    return cleaned && cleaned.length > 0 ? cleaned : null;
  }

  /**
   * 開幕で発話する message を探す。start (なければ最初の message ノード) から
   * outgoing を辿り、最初に出会う message ノードを採用する。
   * 旧版は strictness=locked のみ採用していたが、フローに loose で書かれた
   * 「こんにちは、ご用件をどうぞ」のようなメッセージも開幕で使えるようにする。
   */
  private findOpeningMessage(
    start: FlowNode,
    nodeById: Map<string, FlowNode>,
    outgoing: Map<string, FlowEdge[]>
  ): { nodeId: string; message: string; strictness: MessageStrictness } | null {
    const visited = new Set<string>();
    let current: FlowNode | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.type === "message") {
        const d = current.data as MessageNodeData;
        if (d.message && d.message.trim().length > 0) {
          return {
            nodeId: current.id,
            message: d.message,
            strictness: d.strictness ?? "loose",
          };
        }
        return null;
      }
      const next = outgoing.get(current.id);
      if (!next || next.length === 0) return null;
      current = nodeById.get(next[0].target);
    }
    return null;
  }

  /** 与えられたノード自身が脳の判断対象 (condition / action / end) ならその id、
   *  そうでなければ outgoing を辿って最初の判断対象を探す。 */
  private firstInteractiveFrom(
    from: FlowNode,
    nodeById: Map<string, FlowNode>,
    outgoing: Map<string, FlowEdge[]>
  ): string | null {
    const visited = new Set<string>();
    let current: FlowNode | undefined = from;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (
        current.type === "condition" ||
        current.type === "action" ||
        current.type === "end"
      ) {
        return current.id;
      }
      const next = outgoing.get(current.id);
      if (!next || next.length === 0) return null;
      current = nodeById.get(next[0].target);
    }
    return null;
  }

  /** 指定ノードの「次」から探し始める版。開幕 message の後ろを取りたい時に使う。 */
  private firstInteractiveAfter(
    nodeId: string,
    nodeById: Map<string, FlowNode>,
    outgoing: Map<string, FlowEdge[]>
  ): string | null {
    const next = outgoing.get(nodeId);
    if (!next || next.length === 0) return null;
    const target = nodeById.get(next[0].target);
    if (!target) return null;
    return this.firstInteractiveFrom(target, nodeById, outgoing);
  }

  private resolveFaqMinScore(graph: FlowGraph): number {
    const values = graph.nodes
      .filter(
        (n) =>
          n.type === "action" && (n.data as ActionNodeData).actionType === "faq"
      )
      .map((n) => (n.data as ActionNodeData).precision)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (values.length === 0) return FAQ_MIN_SCORE_DEFAULT;
    return this.precisionToBedrockScore(Math.min(...values));
  }

  // UI の precision (0..1) を Bedrock の vector similarity score 帯 (0.1..0.5) に写像する。
  // Bedrock では 0.5 でも「ほぼ同一」級なので、UI スライダーをそのまま score 閾値として
  // 使うとどんな質問も実用上ヒットしない。ここで現実的な帯にリスケールする。
  private precisionToBedrockScore(precision: number): number {
    const clamped = Math.max(0, Math.min(1, precision));
    return 0.1 + clamped * 0.4;
  }

  private buildOutgoingMap(edges: FlowEdge[]): Map<string, FlowEdge[]> {
    const map = new Map<string, FlowEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.source) ?? [];
      list.push(edge);
      map.set(edge.source, list);
    }
    return map;
  }
}
