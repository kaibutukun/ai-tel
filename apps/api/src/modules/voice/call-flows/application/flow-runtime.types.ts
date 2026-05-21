import {
  ActionType,
  FlowNodeType,
  MessageStrictness,
} from "../domain/flow-types";

// ─────────────────────────────────────────────────────────────
// フロー実行時に Realtime / FlowEngine が扱う型。
//
// 設計のおさらい:
//   - Realtime API = 会話の脳。tool 呼び出しで意思表示する。
//   - FlowEngine  = 現在ノード・収集スロット・遷移可否の正本。
//   - tool 戻り値に毎回 FlowSnapshot を含めて返し、脳がそれを読んで次を決める。
// ─────────────────────────────────────────────────────────────

/** Realtime tool に露出する遷移用の論理ノード表現 */
export interface RuntimeNode {
  id: string;
  type: FlowNodeType;
  label?: string;

  // message
  message?: string;
  strictness?: MessageStrictness;

  // condition
  description?: string;
  branches?: Array<{ condition: string; targetNodeId: string }>;

  // action
  actionType?: ActionType;
  fields?: string[];
  target?: string;

  // end
  endMessage?: string;

  /** ここから到達できる次ノードの id。遷移リクエストはこれに対してのみ許可。 */
  allowedNextNodeIds: string[];
}

export interface CompiledRuntimeFlow {
  flowName: string | null;
  basicInfo: string | null;
  startNodeId: string | null;
  /** 開幕で sayExact に渡す文。フロー側に locked message が無くてもコンパイラがデフォルトを必ず用意する。 */
  openingMessage: string;
  /** openingMessage が locked message ノード由来なら、そのノード ID。デフォルト挨拶由来なら null。 */
  openingLockedMessageNodeId: string | null;
  /**
   * 開幕発話が終わった直後、脳が判断の起点として立つべきノード ID。
   * 例: start → message(挨拶) → condition(振り分け) → ... の場合、開幕で message を
   * 発話したあと脳には condition から始まってほしいので、ここは condition ノードになる。
   * 解決できない場合 null。
   */
  initialCurrentNodeId: string | null;
  defaultEndMessage: string;
  faqMinScore: number;
  documentMinScore: number;
  nodes: Record<string, RuntimeNode>;
}

/** FlowEngine が保持する 1 通話分の状態 */
export interface FlowSession {
  callSessionId: string;
  companyId: string;
  callFlowId: string | null;
  callerNumber?: string;
  defaults: {
    transferTo?: string;
    notifyTarget?: string;
  };
  compiled: CompiledRuntimeFlow;
  currentNodeId: string | null;
  collectedSlots: Record<string, string>;
  visitedNodeIds: string[];
  status: "active" | "ended";
}

/** Realtime に毎回返す状態スナップショット */
export interface FlowSnapshot {
  flowName: string | null;
  basicInfo: string | null;
  status: "active" | "ended";
  currentNode: SnapshotCurrentNode | null;
  collectedSlots: Record<string, string>;
  missingSlots: string[];
  allowedNextNodes: SnapshotNextNode[];
  visitedNodeIds: string[];
}

export interface SnapshotCurrentNode {
  id: string;
  type: FlowNodeType;
  label?: string;
  message?: string;
  strictness?: MessageStrictness;
  description?: string;
  actionType?: ActionType;
  fields?: string[];
  endMessage?: string;
  /** このノードで何をすべきかの 1〜2 行のヒント。脳はこれを読んで動く。 */
  guidance: string;
}

export interface SnapshotNextNode {
  id: string;
  type: FlowNodeType;
  label?: string;
  actionType?: ActionType;
  /** 「(message) 予約に進む」のような短い説明 */
  summary: string;
  /** condition の場合の「〜なら進む」条件文 */
  condition?: string;
}

export interface MoveResult {
  ok: boolean;
  snapshot: FlowSnapshot;
  reason?: string;
  message?: string;
}

export interface UpdateSlotsResult {
  snapshot: FlowSnapshot;
  acceptedSlots: Record<string, string>;
  missingSlots: string[];
}
