import { Node, Edge, MarkerType } from "reactflow";
import { FAQ_PRECISION_DEFAULT } from "./types";

// 新しいフローの初期テンプレート。
// AIは全体の流れを「指針」として読み、自然に会話する。
// ここでは骨組みだけを置き、細かい台詞は最小限。
export const initialNodes: Node[] = [
  {
    id: "start",
    type: "start",
    position: { x: 360, y: 20 },
    data: {},
    deletable: false,
  },

  // ── 開幕の固定挨拶（コンプラ要件等で一字一句固定したい場合の例）
  {
    id: "greeting",
    type: "message",
    position: { x: 305, y: 145 },
    data: {
      message:
        "お電話ありがとうございます。AIアシスタントのアイテルです。ご用件をお聞かせください。",
      strictness: "locked",
    },
  },

  // ── 条件分岐
  {
    id: "main-cond",
    type: "condition",
    position: { x: 265, y: 310 },
    data: {
      description: "ご用件のカテゴリを選択",
      conditions: ["予約", "問い合わせ", "クレーム", "その他"],
    },
  },

  // ── 予約ブランチ: 情報収集 → 通知 → 終了
  {
    id: "collect-booking",
    type: "action",
    position: { x: -60, y: 500 },
    data: {
      actionType: "collect",
      fields: ["お名前", "ご連絡先", "希望日時"],
    },
  },
  {
    id: "notify-booking",
    type: "action",
    position: { x: -60, y: 650 },
    data: { actionType: "notify", target: "staff@example.com" },
  },
  {
    id: "end-booking",
    type: "end",
    position: { x: -60, y: 800 },
    data: { endMessage: "ご予約内容を承りました。お電話ありがとうございました。" },
  },

  // ── 問い合わせブランチ: FAQ → 資料検索 → 終了
  {
    id: "faq-inquiry",
    type: "action",
    position: { x: 205, y: 500 },
    data: { actionType: "faq", precision: FAQ_PRECISION_DEFAULT },
  },
  {
    id: "rag-inquiry",
    type: "action",
    position: { x: 205, y: 650 },
    data: { actionType: "rag" },
  },
  {
    id: "end-inquiry",
    type: "end",
    position: { x: 205, y: 800 },
    data: { endMessage: "他にご質問はございませんか？ありがとうございました。" },
  },

  // ── クレームブランチ: 即転送
  {
    id: "transfer-complaint",
    type: "action",
    position: { x: 500, y: 500 },
    data: { actionType: "transfer", target: "090-1111-2222" },
  },

  // ── その他ブランチ: 情報収集 → 終了（折り返し連絡前提）
  {
    id: "collect-other",
    type: "action",
    position: { x: 770, y: 500 },
    data: {
      actionType: "collect",
      fields: ["お名前", "ご連絡先", "ご用件"],
    },
  },
  {
    id: "end-other",
    type: "end",
    position: { x: 770, y: 650 },
    data: { endMessage: "担当者より折り返しご連絡いたします。お電話ありがとうございました。" },
  },
];

const edgeDefaults = {
  type: "smoothstep",
  markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
  style: { strokeWidth: 2 },
};

export const initialEdges: Edge[] = [
  { ...edgeDefaults, id: "e-start-greeting", source: "start", target: "greeting" },
  { ...edgeDefaults, id: "e-greeting-cond", source: "greeting", target: "main-cond" },

  // 条件分岐 → 各ブランチ
  {
    ...edgeDefaults,
    id: "e-cond-booking",
    source: "main-cond",
    sourceHandle: "cond-0",
    target: "collect-booking",
    label: "予約",
    labelStyle: { fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#fef3c7", rx: 4 },
  },
  {
    ...edgeDefaults,
    id: "e-cond-inquiry",
    source: "main-cond",
    sourceHandle: "cond-1",
    target: "faq-inquiry",
    label: "問い合わせ",
    labelStyle: { fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#fef3c7", rx: 4 },
  },
  {
    ...edgeDefaults,
    id: "e-cond-complaint",
    source: "main-cond",
    sourceHandle: "cond-2",
    target: "transfer-complaint",
    label: "クレーム",
    labelStyle: { fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#fef3c7", rx: 4 },
  },
  {
    ...edgeDefaults,
    id: "e-cond-other",
    source: "main-cond",
    sourceHandle: "cond-3",
    target: "collect-other",
    label: "その他",
    labelStyle: { fontSize: 11, fontWeight: 600 },
    labelBgStyle: { fill: "#fef3c7", rx: 4 },
  },

  // 予約 → 通知 → 終了
  { ...edgeDefaults, id: "e-booking-notify", source: "collect-booking", target: "notify-booking" },
  { ...edgeDefaults, id: "e-notify-end", source: "notify-booking", target: "end-booking" },

  // 問い合わせ → FAQ → RAG → 終了
  { ...edgeDefaults, id: "e-faq-rag", source: "faq-inquiry", target: "rag-inquiry", label: "未回答", labelStyle: { fontSize: 10 }, labelBgStyle: { fill: "#f0f9ff", rx: 3 } },
  { ...edgeDefaults, id: "e-rag-end", source: "rag-inquiry", target: "end-inquiry" },

  // その他 → 終了
  { ...edgeDefaults, id: "e-other-end", source: "collect-other", target: "end-other" },
];
