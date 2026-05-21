import { Injectable, Logger } from "@nestjs/common";
import {
  CompiledRuntimeFlow,
  FlowSession,
  FlowSnapshot,
  MoveResult,
  RuntimeNode,
  SnapshotCurrentNode,
  SnapshotNextNode,
  UpdateSlotsResult,
} from "./flow-runtime.types";

// ─────────────────────────────────────────────────────────────
// FlowEngineService
//
// 1 通話 = 1 FlowSession。Realtime からの tool 呼び出しはバックエンドの
// この Engine を経由する。Realtime は会話の脳としてふるまうが、
// 「今どのノードに居るか」「次にどこへ行けるか」「収集スロットの正本」は
// Engine が握っており、Realtime が勝手にフローを書き換えることはできない。
//
// 注意点:
//   - 状態はメモリ上 (Map)。プロセス再起動で吹き飛ぶが、通話セッション中
//     しか保持しないので問題ない (永続化は CallSummary 等の DB に任せる)。
//   - スレッドセーフ性は同一通話内で順次 tool が呼ばれる前提に依存している。
// ─────────────────────────────────────────────────────────────

const NORMALIZE_REGEX = /[\s　:：・,，、。]/g;
const POLITE_PREFIX_REGEX = /^[おご御]/;

@Injectable()
export class FlowEngineService {
  private readonly logger = new Logger(FlowEngineService.name);
  private readonly sessions = new Map<string, FlowSession>();

  register(input: {
    callSessionId: string;
    companyId: string;
    callFlowId: string | null;
    callerNumber?: string;
    compiled: CompiledRuntimeFlow;
    defaults?: { transferTo?: string; notifyTarget?: string };
  }): FlowSession {
    // 開幕発話 (sayExact) と current node を分離する。
    // 開幕の message は bridge が sayExact で発話する一方、脳は「その次」の interactive
    // ノード (condition / action / end) に居る状態でユーザー応答を待つ。
    // 旧版は openingLockedMessageNodeId をそのまま current にしていたので、開幕メッセージの
    // 次が条件分岐でも脳が message ノードに居続けて振り分けが効かなかった。
    const initialNodeId =
      input.compiled.initialCurrentNodeId ??
      input.compiled.startNodeId ??
      Object.keys(input.compiled.nodes)[0] ??
      null;

    const session: FlowSession = {
      callSessionId: input.callSessionId,
      companyId: input.companyId,
      callFlowId: input.callFlowId,
      callerNumber: input.callerNumber,
      defaults: {
        transferTo: input.defaults?.transferTo,
        notifyTarget: input.defaults?.notifyTarget,
      },
      compiled: input.compiled,
      currentNodeId: initialNodeId,
      collectedSlots: {},
      visitedNodeIds: initialNodeId ? [initialNodeId] : [],
      status: "active",
    };
    this.sessions.set(input.callSessionId, session);
    this.logger.log(
      `register session=${input.callSessionId} initialNode=${initialNodeId ?? "-"} ` +
        `nodes=${Object.keys(input.compiled.nodes).length}`
    );
    return session;
  }

  unregister(callSessionId: string) {
    this.sessions.delete(callSessionId);
  }

  get(callSessionId: string): FlowSession | null {
    return this.sessions.get(callSessionId) ?? null;
  }

  /** 現在の状態を Realtime に渡す snapshot 形式で取得 */
  snapshot(callSessionId: string): FlowSnapshot {
    const session = this.sessions.get(callSessionId);
    if (!session) return this.emptySnapshot();
    return this.buildSnapshot(session);
  }

  /** collect ノードでのスロット保存。fields は string→string で正規化済みを期待。 */
  updateSlots(
    callSessionId: string,
    slots: Record<string, string>
  ): UpdateSlotsResult {
    const session = this.sessions.get(callSessionId);
    if (!session) {
      return {
        snapshot: this.emptySnapshot(),
        acceptedSlots: {},
        missingSlots: [],
      };
    }
    const current = this.currentNode(session);
    const requiredFields = this.collectRequiredFields(current);

    const canonical = this.canonicalizeSlots(slots, requiredFields);
    Object.assign(session.collectedSlots, canonical);

    const missingSlots = requiredFields.filter(
      (f) => !this.hasValue(session.collectedSlots[f])
    );

    return {
      snapshot: this.buildSnapshot(session),
      acceptedSlots: canonical,
      missingSlots,
    };
  }

  /**
   * 次ノードへ進む。allowedNextNodeIds に無い遷移、収集未完了の collect ノードからの
   * 離脱は拒否する。これが Backend = 正本 の核。
   */
  moveTo(
    callSessionId: string,
    targetNodeId: string,
    reason?: string
  ): MoveResult {
    const session = this.sessions.get(callSessionId);
    if (!session) {
      return {
        ok: false,
        snapshot: this.emptySnapshot(),
        message: "通話セッションがフローエンジンに登録されていません",
      };
    }
    const current = this.currentNode(session);

    if (!current) {
      return {
        ok: false,
        snapshot: this.buildSnapshot(session),
        message: "現在のノードが特定できません",
      };
    }

    const target = session.compiled.nodes[targetNodeId];
    if (!target) {
      return {
        ok: false,
        snapshot: this.buildSnapshot(session),
        message: `指定された target_node_id (${targetNodeId}) は存在しません`,
      };
    }

    if (!current.allowedNextNodeIds.includes(targetNodeId)) {
      return {
        ok: false,
        snapshot: this.buildSnapshot(session),
        message:
          `現在のノード「${current.label ?? current.id}」から ` +
          `「${target.label ?? target.id}」へは遷移できません。` +
          `allowedNextNodes に含まれている id のみ指定してください。`,
      };
    }

    if (
      current.type === "action" &&
      current.actionType === "collect" &&
      this.hasMissingRequiredSlots(current, session.collectedSlots)
    ) {
      return {
        ok: false,
        snapshot: this.buildSnapshot(session),
        message:
          "情報収集ノードに未確認の項目が残っています。update_collected_info で埋めてから移動してください。",
      };
    }

    session.currentNodeId = targetNodeId;
    if (!session.visitedNodeIds.includes(targetNodeId)) {
      session.visitedNodeIds.push(targetNodeId);
    }

    this.logger.log(
      `move session=${callSessionId} ${current.id} → ${targetNodeId} ` +
        `reason=${reason ?? "-"}`
    );

    return {
      ok: true,
      snapshot: this.buildSnapshot(session),
      reason,
    };
  }

  markEnded(callSessionId: string) {
    const session = this.sessions.get(callSessionId);
    if (!session) return;
    session.status = "ended";
  }

  // ────────────────────────────────────────────
  // 内部
  // ────────────────────────────────────────────

  private currentNode(session: FlowSession): RuntimeNode | null {
    if (!session.currentNodeId) return null;
    return session.compiled.nodes[session.currentNodeId] ?? null;
  }

  private buildSnapshot(session: FlowSession): FlowSnapshot {
    const current = this.currentNode(session);
    return {
      flowName: session.compiled.flowName,
      basicInfo: session.compiled.basicInfo,
      status: session.status,
      currentNode: current ? this.toSnapshotCurrent(current, session) : null,
      collectedSlots: { ...session.collectedSlots },
      missingSlots: current
        ? this.collectRequiredFields(current).filter(
            (f) => !this.hasValue(session.collectedSlots[f])
          )
        : [],
      allowedNextNodes: current
        ? current.allowedNextNodeIds
            .map((id) => session.compiled.nodes[id])
            .filter((n): n is RuntimeNode => Boolean(n))
            .map((n) => this.toSnapshotNext(n, current))
        : [],
      visitedNodeIds: [...session.visitedNodeIds],
    };
  }

  private toSnapshotCurrent(
    node: RuntimeNode,
    session: FlowSession
  ): SnapshotCurrentNode {
    return {
      id: node.id,
      type: node.type,
      label: node.label,
      message: node.message,
      strictness: node.strictness,
      description: node.description,
      actionType: node.actionType,
      fields: node.fields,
      endMessage: node.endMessage,
      guidance: this.buildGuidance(node, session),
    };
  }

  private toSnapshotNext(
    target: RuntimeNode,
    from: RuntimeNode
  ): SnapshotNextNode {
    const label = target.label ?? target.id;
    const typeJa = this.typeLabel(target);
    const summary = `[${typeJa}] ${label}`;
    const condition = this.findConditionForEdge(from, target.id);
    return {
      id: target.id,
      type: target.type,
      label: target.label,
      actionType: target.actionType,
      summary,
      condition,
    };
  }

  private findConditionForEdge(
    from: RuntimeNode,
    targetId: string
  ): string | undefined {
    if (from.type !== "condition") return undefined;
    return from.branches?.find((b) => b.targetNodeId === targetId)?.condition;
  }

  /**
   * 現在ノードで脳がやるべきことを 1〜2 行で示すヒント。
   * 「プロンプトで縛らない」方針なので、長いガイドラインは書かず短く要点だけ。
   */
  private buildGuidance(node: RuntimeNode, session: FlowSession): string {
    switch (node.type) {
      case "start":
        return "通話の冒頭です。簡潔に第一声を伝え、move_to_node で次のノードへ進んでください。";
      case "message": {
        const isLocked = node.strictness === "locked";
        if (isLocked) {
          return `次の文を一字一句そのまま発話してから move_to_node で次へ:「${node.message ?? ""}」`;
        }
        return `次の趣旨を自然に伝えてから move_to_node で次へ:「${node.message ?? ""}」`;
      }
      case "condition": {
        const desc = node.description ? `(${node.description})` : "";
        return `分岐ノード${desc}。allowedNextNodes の中から会話の流れに合うものを選び、move_to_node で進んでください。`;
      }
      case "action": {
        switch (node.actionType) {
          case "faq":
            return "ユーザーの質問を query にして search_faq を呼び、得られた answer のみを根拠に短く案内した上で move_to_node で次へ進んでください。";
          case "rag":
            return "必要なら search_documents で資料を参照し、その内容のみを根拠に案内した上で move_to_node で次へ。";
          case "transfer":
            return `担当者 (${node.target ?? session.defaults.transferTo ?? "未設定"}) へ取り次ぐ場面です。request_transfer を呼んでください。`;
          case "notify": {
            const target = node.target ?? session.defaults.notifyTarget ?? "未設定";
            return `通知ノード。内容を整えてから send_notification を呼び (送信先: ${target})、move_to_node で次へ。`;
          }
          case "collect": {
            const fields = (node.fields ?? []).join("・");
            return `情報収集ノード。次の項目を聞き取って update_collected_info で逐次保存。missingSlots が空になったら move_to_node で次へ: ${fields || "(項目未設定)"}`;
          }
          default:
            return "アクションノード。snapshot を確認して次の手を判断してください。";
        }
      }
      case "end": {
        const closing = node.endMessage ?? session.compiled.defaultEndMessage;
        return (
          `通話終了予定のノード。いきなり切ってはいけません。` +
          `まず「他にご質問はございますか？」と確認し、ユーザーが「特にない / 大丈夫 / ありがとう」等で同意したことを認めてから ` +
          `「${closing}」と伝え、その後にようやく request_end_call を呼んでください。` +
          `ユーザーがまだ何か聞きたい素振りであれば request_end_call を呼ばず、その質問に答えてください。`
        );
      }
      default:
        return "snapshot を確認して次の手を判断してください。";
    }
  }

  private collectRequiredFields(node: RuntimeNode | null): string[] {
    if (!node) return [];
    if (node.type !== "action") return [];
    if (node.actionType !== "collect") return [];
    return (node.fields ?? []).filter((f) => f.trim().length > 0);
  }

  private hasMissingRequiredSlots(
    node: RuntimeNode,
    slots: Record<string, string>
  ): boolean {
    return this.collectRequiredFields(node).some((f) => !this.hasValue(slots[f]));
  }

  private hasValue(value: string | undefined): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  /**
   * 入力スロットのキーが「ご住所」「住所:」など揺れていても、フロー側の required field
   * 名に正規化してマージできるようにする。
   */
  private canonicalizeSlots(
    slots: Record<string, string>,
    requiredFields: string[]
  ): Record<string, string> {
    if (requiredFields.length === 0) {
      return Object.fromEntries(
        Object.entries(slots).map(([k, v]) => [k.trim(), String(v).trim()])
      );
    }
    const canonicalByNormalized = new Map(
      requiredFields.map((field) => [this.normalizeFieldName(field), field])
    );
    return Object.fromEntries(
      Object.entries(slots).map(([key, value]) => {
        const canonical =
          canonicalByNormalized.get(this.normalizeFieldName(key)) ?? key.trim();
        return [canonical, String(value ?? "").trim()];
      })
    );
  }

  private normalizeFieldName(value: string): string {
    return value.replace(NORMALIZE_REGEX, "").replace(POLITE_PREFIX_REGEX, "");
  }

  private typeLabel(node: RuntimeNode): string {
    if (node.type === "action" && node.actionType) {
      return (
        {
          faq: "FAQ回答",
          rag: "資料検索",
          transfer: "転送",
          notify: "通知送信",
          collect: "情報収集",
        }[node.actionType] ?? "action"
      );
    }
    return (
      {
        start: "開始",
        message: "発話",
        condition: "分岐",
        end: "終了",
        action: "action",
      } as Record<string, string>
    )[node.type] ?? node.type;
  }

  private emptySnapshot(): FlowSnapshot {
    return {
      flowName: null,
      basicInfo: null,
      status: "ended",
      currentNode: null,
      collectedSlots: {},
      missingSlots: [],
      allowedNextNodes: [],
      visitedNodeIds: [],
    };
  }
}
