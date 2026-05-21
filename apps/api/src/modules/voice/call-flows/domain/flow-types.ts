// フロントエンドの flow-editor/types.ts に対応するバックエンド側型定義。
// CallFlow.flowJson に保存される構造を表す。
//
// 重要な設計:
//   フロー = "おおざっぱな進行台本"。実行はLLMが裁量で行うので、ここで定義する
//   ノードは LLM へのプロンプト材料 + ツール定義の元データに過ぎない。

export type FlowNodeType =
  | "start"
  | "message"
  | "condition"
  | "action"
  | "end";

export type ActionType =
  | "faq"
  | "rag"
  | "transfer"
  | "notify"
  | "collect";

export type MessageStrictness = "locked" | "loose";

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position?: { x: number; y: number };
  data: FlowNodeData;
}

export type FlowNodeData =
  | StartNodeData
  | MessageNodeData
  | ConditionNodeData
  | ActionNodeData
  | EndNodeData;

export interface StartNodeData {
  label?: string;
}

export interface MessageNodeData {
  label?: string;
  message: string;
  strictness?: MessageStrictness;
}

export interface ConditionNodeData {
  label?: string;
  description?: string;
  conditions: string[];
}

export interface ActionNodeData {
  label?: string;
  actionType: ActionType;
  fields?: string[];
  target?: string;
  /** faq 用: ベクトル類似度の閾値 (0.5〜0.9)。デフォルト 0.7。 */
  precision?: number;
}

export interface EndNodeData {
  label?: string;
  endMessage?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  /** 通話AIが常に参照する短い基本情報・役割指示 */
  basicInfo?: string | string[];
}

export const BASIC_INFO_MAX_LENGTH = 30;
// Bedrock Knowledge Base の vector similarity score は cosine ベースで、
// 実用的な「関連性あり」は概ね 0.3〜0.5。0.7 以上はほぼ同一文レベルで現実的にヒットしない。
// UI スライダー precision (0..1) はコンパイラ側で 0.1..0.5 にマップしてからこの帯に合わせる。
export const FAQ_MIN_SCORE_DEFAULT = 0.3;
export const DOCUMENT_MIN_SCORE_DEFAULT = 0.3;

// フロー JSON が想定どおりの形か簡易検証
export function isFlowGraph(value: unknown): value is FlowGraph {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.nodes) && Array.isArray(v.edges);
}
