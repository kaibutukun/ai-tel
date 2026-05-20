// ─────────────────────────────────────────────────────────────
// Supervisor (Brain) の型定義
//
// Brain は通話 1 回ごとにインスタンス化され、毎ユーザー発話完了時に
// tick() を呼ばれる。tick() の結果は BrainCommand として返り、
// Director がそれを Speaker への注入操作に翻訳する。
// ─────────────────────────────────────────────────────────────

/** 通話 1 回分の Brain が保持する state */
export interface BrainState {
  /** 現在いるフローノード ID。Brain が完全に所有する。 */
  currentNodeId: string;
  /** これまでに通過したノード ID 履歴。ループ検出や軌道追跡に使う。 */
  visitedNodeIds: string[];
  /** 情報収集ノードで集まったフィールド。submit_collected_info のマージ結果と同期。 */
  collectedFields: Record<string, string>;
  /** 直近に処理したユーザー発話の通し番号。重複 tick 抑制に使う。 */
  lastProcessedTurnIndex: number;
  /** Brain.tick が連続で何回 stay を返したか。Brain への入力シグナル。 */
  consecutiveStayCount: number;
}

/** 会話履歴の 1 ターン分 */
export interface BrainTurn {
  speaker: "USER" | "AI";
  text: string;
  /** 通話開始からの秒数 */
  atSeconds: number;
}

/** tick() の入力 */
export interface BrainTickInput {
  /** ユーザー発話の通し番号（n 番目）。Brain.tick の重複呼び出し検出に使う。 */
  turnIndex: number;
  /** 直近 N ターンの会話履歴（時系列順）。Brain への入力サイズを抑えるため最近分のみ。 */
  recentTurns: BrainTurn[];
  /** 直近のユーザー発話（recentTurns の末尾と同じだが取り出しやすさのため別途渡す） */
  latestUserUtterance: string;
}

// ─────────────────────────────────────────────────────────────
// Brain が返す構造化コマンド
// ─────────────────────────────────────────────────────────────

export type BrainCommand =
  | { type: "stay"; reasoning?: string }
  | {
      type: "inject_hint";
      /** 応対役へ system note として注入する短い指示 (≤200 chars) */
      note: string;
      reasoning?: string;
    }
  | {
      type: "switch_node";
      /** 新しい currentNodeId */
      nodeId: string;
      /** 応対役へ system note として注入する指示文 */
      directive: string;
      /** FAQ/RAG action node に入る時の検索クエリ。省略時は最新発話を使う。 */
      query?: string;
      reasoning?: string;
    }
  | {
      type: "wait_heavy";
      /** 重い判断中に Speaker に喋らせる繋ぎ発話。省略可。 */
      fillerUtterance?: string;
      reasoning?: string;
    }
  | { type: "end_call"; reasoning?: string };

/**
 * Brain が出力すべき JSON Schema の root 型。
 * gpt-4o(-mini) の structured outputs で使う。
 */
export const BRAIN_COMMAND_JSON_SCHEMA = {
  name: "brain_command",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: {
        type: "string",
        enum: ["stay", "inject_hint", "switch_node", "wait_heavy", "end_call"],
        description: "コマンド種別",
      },
      note: {
        type: ["string", "null"],
        description: "inject_hint 時のシステム注入文（200文字以内）",
      },
      nodeId: {
        type: ["string", "null"],
        description: "switch_node 時の新ノードID",
      },
      directive: {
        type: ["string", "null"],
        description: "switch_node 時の応対役への指示文",
      },
      query: {
        type: ["string", "null"],
        description: "FAQ/RAG action node へ switch_node する時の検索クエリ",
      },
      fillerUtterance: {
        type: ["string", "null"],
        description: "wait_heavy 時の繋ぎ発話。省略時は無音",
      },
      reasoning: {
        type: ["string", "null"],
        description: "判断理由を一言（30〜100文字程度）",
      },
    },
    required: [
      "type",
      "note",
      "nodeId",
      "directive",
      "query",
      "fillerUtterance",
      "reasoning",
    ],
  },
  strict: true,
} as const;
