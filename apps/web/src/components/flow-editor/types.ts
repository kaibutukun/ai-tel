export type NodeType = "start" | "message" | "condition" | "action" | "end";

export type ActionType =
  | "faq"
  | "rag"
  | "transfer"
  | "callback"
  | "notify"
  | "collect";

export interface StartNodeData {
  label?: string;
}

export interface MessageNodeData {
  label?: string;
  message: string;
}

export interface ConditionNodeData {
  label?: string;
  description?: string;
  conditions: string[];
}

export interface ActionNodeData {
  label?: string;
  actionType: ActionType;
  // collect
  fields?: string[];
  // transfer / notify
  target?: string;
  // faq / rag – no extra fields needed
}

export interface EndNodeData {
  label?: string;
  endMessage?: string;
}

export type AnyNodeData =
  | StartNodeData
  | MessageNodeData
  | ConditionNodeData
  | ActionNodeData
  | EndNodeData;

export const ACTION_LABELS: Record<ActionType, string> = {
  faq: "FAQ回答",
  rag: "AI回答（資料検索）",
  transfer: "転送",
  callback: "折り返し受付",
  notify: "通知送信",
  collect: "情報収集",
};

export const ACTION_COLORS: Record<ActionType, string> = {
  faq: "#06b6d4",
  rag: "#6366f1",
  transfer: "#f97316",
  callback: "#ec4899",
  notify: "#10b981",
  collect: "#8b5cf6",
};
