// フローエディタで扱うノード／ノードデータの型。
// 重要: ここでの「フロー」は厳密実行用の状態機械ではなく、Realtime API へ渡す
//        "おおざっぱな進行台本" のための入力データ。
//        実際の会話進行は LLM が裁量で行うので、ここで定義する内容は
//        あくまで LLM への指示用ヒント。

export type NodeType = "start" | "message" | "condition" | "action" | "end";

// action はもはや「実行するノード」ではなく「LLM が呼べる副作用ツール」のラッパー。
// 用途が固定化された型のみを残す。
export type ActionType =
  | "faq"       // 社内FAQ参照
  | "rag"       // 資料検索
  | "transfer"  // 担当者へ転送
  | "notify"    // 通知送信
  | "collect";  // 情報収集（フィールド埋まるまで対話）

// メッセージの厳密度。Realtime API へのプロンプト化で挙動が変わる。
//  - locked: 入った瞬間に一字一句この通り発話させる（assistant 注入）
//  - loose : "だいたいこの内容を伝える" だけ指示。文脈に応じて LLM が言い回し調整
export type MessageStrictness = "locked" | "loose";

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
  conditions: string[]; // 各エントリが下部ハンドルに対応
}

export interface ActionNodeData {
  label?: string;
  actionType: ActionType;
  // collect 用
  fields?: string[];
  // transfer / notify 用
  target?: string;
  // faq 用: ベクトル類似度の閾値 (0.5〜0.9)。デフォルト 0.7。
  // 登録FAQとの一致度がこの値以上のものだけ採用する。高いほど厳しく、低いほど緩い。
  // rag (資料検索) は緩い固定閾値を使うため、ここでは使用しない。
  precision?: number;
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

// ─────────────────────────────────────────
// 表示用ラベル/カラー
// ─────────────────────────────────────────

export const ACTION_LABELS: Record<ActionType, string> = {
  faq: "FAQ回答",
  rag: "AI回答（資料検索）",
  transfer: "転送",
  notify: "通知送信",
  collect: "情報収集",
};

export const ACTION_COLORS: Record<ActionType, string> = {
  faq: "#06b6d4",
  rag: "#6366f1",
  transfer: "#f97316",
  notify: "#10b981",
  collect: "#8b5cf6",
};

// faq の精度パラメータの既定値とレンジ
export const FAQ_PRECISION_DEFAULT = 0.7;
export const FAQ_PRECISION_MIN = 0.5;
export const FAQ_PRECISION_MAX = 0.9;
export const FAQ_PRECISION_STEP = 0.05;
