// ─────────────────────────────────────────────────────────────
// Realtime API に露出する function tools の静的カタログ。
//
// 設計方針:
//   - フローの動的内容（どのアクションがあるか等）に依存しない静的セット。
//     Realtime はどのツールが必要かを snapshot から判断する。
//   - すべてのツール戻り値には FlowSnapshot を含める運用にする (ToolExecutor 側)。
//   - ツール名はバックエンドの責務名 (move_to_node / update_collected_info / ...)
//     に揃え、「フローを進めるのは Backend」「会話を回すのは Realtime」を明示する。
// ─────────────────────────────────────────────────────────────

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

export const REALTIME_TOOLS: RealtimeTool[] = [
  {
    type: "function",
    name: "get_flow_state",
    description:
      "現在のフロー状態 (currentNode, collectedSlots, allowedNextNodes 等) を取得する。フローの現在地に確信が持てない時に呼ぶ。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_collected_info",
    description:
      "情報収集ノードで聞き取った項目を保存する。部分的にしか聞けていなくても呼んでよい。戻り値の missingSlots を見て不足を聞き直す。",
    parameters: {
      type: "object",
      properties: {
        slots: {
          type: "object",
          description:
            "聞き取った項目名と値のペア。例: {お名前: '山田', 連絡先: '090-...'}",
          additionalProperties: { type: "string" },
        },
      },
      required: ["slots"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "move_to_node",
    description:
      "次のノードへ進む。allowedNextNodes に含まれる id のみ指定可能。バックエンドが遷移可否を検証し、結果を返す。",
    parameters: {
      type: "object",
      properties: {
        target_node_id: {
          type: "string",
          description: "進みたい次ノードの id (snapshot.allowedNextNodes[].id)",
        },
        reason: {
          type: "string",
          description: "遷移を選んだ短い理由 (ログ用)",
        },
      },
      required: ["target_node_id"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_faq",
    description:
      "社内に登録された FAQ を検索する。お客様の質問に近いものを探したい時に使う。返ってきた answer のみを根拠に応対すること。",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "検索クエリ (お客様の質問を要約)",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_documents",
    description:
      "登録された参考資料を検索する。FAQ では足りない詳細質問のときに使う。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "検索クエリ" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "send_notification",
    description: "担当者へ通知を送る (メール / Slack / Webhook 等)。",
    parameters: {
      type: "object",
      properties: {
        body: { type: "string", description: "通知本文" },
        subject: { type: "string", description: "件名" },
        target: {
          type: "string",
          description: "通知先。省略時はフロー設定の既定値を使用。",
        },
      },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_transfer",
    description:
      "担当者へ通話を取り次ぐ。お客様が人と話したい、あるいはフローが transfer ノードに到達した時に呼ぶ。",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "転送先電話番号。省略時はフロー設定の既定値を使用。",
        },
        reason: { type: "string", description: "転送理由" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "request_end_call",
    description: "通話を終了する。お礼を述べた後に呼ぶこと。",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", description: "終了理由 (例: 用件完了)" },
      },
      additionalProperties: false,
    },
  },
];

/**
 * Realtime に渡す instructions (システムプロンプト)。
 * 「プロンプトで挙動を縛らない」方針に従い、最小限の役割定義のみ書く。
 * フロー判断ルールや禁則事項は書かない。それは snapshot.guidance とコード側で担保する。
 */
export const REALTIME_BASE_INSTRUCTIONS = [
  "あなたは電話オペレーターのAIアシスタントです。",
  "音声通話なので、自然で短めの口語で、敬語を使って応対してください。",
  "句読点ごとに区切らず、息継ぎのリズムで話してください。",
  "",
  "フローの「現在ノード」「収集スロット」「次に行けるノード」はすべてバックエンドが管理しています。",
  "tool を呼ぶたびに最新の FlowSnapshot が戻り値の snapshot フィールドに入って返ってくるので、",
  "それを根拠に次の発話・次の tool 呼び出しを決めてください。",
  "",
  "迷ったら get_flow_state で現在の snapshot を確認してください。",
  "フローを次へ進めるときは必ず move_to_node を呼びます。allowedNextNodes に無い遷移は拒否されます。",
].join("\n");
