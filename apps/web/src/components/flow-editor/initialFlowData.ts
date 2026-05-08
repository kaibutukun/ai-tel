import { Node, Edge, MarkerType } from "reactflow";

export const initialNodes: Node[] = [
  {
    id: "start",
    type: "start",
    position: { x: 360, y: 20 },
    data: {},
    deletable: false,
  },
  {
    id: "greeting",
    type: "message",
    position: { x: 305, y: 145 },
    data: {
      message:
        "お電話ありがとうございます。AIアシスタントのアイテルです。ご用件をお聞かせください。",
    },
  },
  {
    id: "main-cond",
    type: "condition",
    position: { x: 265, y: 310 },
    data: {
      description: "ご用件のカテゴリを選択",
      conditions: ["予約", "問い合わせ", "クレーム", "その他"],
    },
  },
  // ── 予約ブランチ
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
    data: { endMessage: "予約内容を承りました。後ほどご連絡いたします。" },
  },
  // ── 問い合わせブランチ
  {
    id: "faq-inquiry",
    type: "action",
    position: { x: 205, y: 500 },
    data: { actionType: "faq" },
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
    data: { endMessage: "ご不明点は解決しましたでしょうか？ありがとうございました。" },
  },
  // ── クレームブランチ
  {
    id: "transfer-complaint",
    type: "action",
    position: { x: 500, y: 500 },
    data: { actionType: "transfer", target: "090-1111-2222" },
  },
  {
    id: "end-complaint",
    type: "end",
    position: { x: 500, y: 650 },
    data: { endMessage: "担当者にお繋ぎしました。大変失礼いたしました。" },
  },
  // ── その他ブランチ
  {
    id: "collect-other",
    type: "action",
    position: { x: 780, y: 500 },
    data: {
      actionType: "collect",
      fields: ["お名前", "ご連絡先", "ご用件"],
    },
  },
  {
    id: "callback-other",
    type: "action",
    position: { x: 780, y: 650 },
    data: { actionType: "callback" },
  },
  {
    id: "end-other",
    type: "end",
    position: { x: 780, y: 800 },
    data: { endMessage: "折り返しのご連絡をお待ちください。" },
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

  // 条件分岐 → 各ブランチ（labelでハンドルを識別）
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

  // 予約ブランチ
  { ...edgeDefaults, id: "e-collect-notify", source: "collect-booking", target: "notify-booking" },
  { ...edgeDefaults, id: "e-notify-end1", source: "notify-booking", target: "end-booking" },

  // 問い合わせブランチ
  { ...edgeDefaults, id: "e-faq-rag", source: "faq-inquiry", target: "rag-inquiry", label: "未回答", labelStyle: { fontSize: 10 }, labelBgStyle: { fill: "#f0f9ff", rx: 3 } },
  { ...edgeDefaults, id: "e-rag-end2", source: "rag-inquiry", target: "end-inquiry" },

  // クレームブランチ
  { ...edgeDefaults, id: "e-transfer-end3", source: "transfer-complaint", target: "end-complaint" },

  // その他ブランチ
  { ...edgeDefaults, id: "e-collect-cb", source: "collect-other", target: "callback-other" },
  { ...edgeDefaults, id: "e-cb-end4", source: "callback-other", target: "end-other" },
];
