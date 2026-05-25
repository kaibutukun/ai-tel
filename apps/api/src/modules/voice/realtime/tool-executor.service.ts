import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { AiService } from "../../knowledge/ai-answering/ai.service";
import { FlowEngineService } from "../call-flows/application/flow-engine.service";
import { FlowSnapshot } from "../call-flows/application/flow-runtime.types";

// ─────────────────────────────────────────────────────────────
// ToolExecutorService (新コア)
//
// Realtime API から飛んでくる function call をバックエンドの責務に翻訳する。
//
// 設計原則:
//   - フロー状態 (currentNode, slots, allowedNextNodes) の正本は FlowEngine。
//     このサービスは Engine を呼ぶだけで、状態判定はしない。
//   - 副作用 (DB / 検索 / 転送 / 終了) はここに集約する。
//   - すべての戻り値に snapshot を含める。Realtime はこれを根拠に次を判断する。
// ─────────────────────────────────────────────────────────────

export interface ToolContext {
  callSessionId: string;
  companyId: string;
  callFlowId: string | null;
  callerNumber?: string;
}

export interface ToolCallPayload {
  callId: string;
  name: string;
  arguments: string;
}

export interface ToolExecutionResult {
  output: Record<string, unknown>;
  sideEffect?:
    | { kind: "transfer"; to: string; reason?: string }
    | { kind: "end_call"; reason?: string };
}

type KnowledgeSourceLite = {
  id?: string;
  source?: string;
  faqId?: string;
  documentId?: string;
  category?: string;
  title?: string;
  score?: number;
};

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly engine: FlowEngineService
  ) {}

  async execute(
    call: ToolCallPayload,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const args = this.parseArgs(call.arguments, call.name);

    switch (call.name) {
      case "get_flow_state":
        return this.handleGetFlowState(ctx);
      case "update_collected_info":
        return this.handleUpdateCollectedInfo(args, ctx);
      case "move_to_node":
        return this.handleMoveToNode(args, ctx);
      case "search_faq":
        return this.handleSearchFaq(args, ctx);
      case "search_documents":
        return this.handleSearchDocuments(args, ctx);
      case "send_notification":
        return this.handleSendNotification(args, ctx);
      case "request_transfer":
        return this.handleRequestTransfer(args, ctx);
      case "request_end_call":
        return this.handleRequestEndCall(args, ctx);
      default:
        this.logger.warn(`Unknown tool call: ${call.name}`);
        return this.failure(ctx, `unknown tool: ${call.name}`);
    }
  }

  // ────────────────────────────────────────────
  // tool 実装
  // ────────────────────────────────────────────

  private handleGetFlowState(ctx: ToolContext): ToolExecutionResult {
    return {
      output: {
        ok: true,
        snapshot: this.snapshot(ctx),
      },
    };
  }

  private async handleUpdateCollectedInfo(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const raw = args.slots;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return this.failure(ctx, "slots (object) is required");
    }

    const slots: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value === null || value === undefined) continue;
      slots[key] = String(value);
    }

    const result = this.engine.updateSlots(ctx.callSessionId, slots);

    if (ctx.callSessionId) {
      await this.persistCollectedSlots(
        ctx.callSessionId,
        result.snapshot.collectedSlots,
        result.snapshot.missingSlots
      );
    }

    return {
      output: {
        ok: result.missingSlots.length === 0,
        acceptedSlots: result.acceptedSlots,
        missingSlots: result.missingSlots,
        snapshot: result.snapshot,
      },
    };
  }

  private handleMoveToNode(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolExecutionResult {
    const targetNodeId =
      typeof args.target_node_id === "string"
        ? args.target_node_id
        : typeof args.targetNodeId === "string"
        ? args.targetNodeId
        : "";
    const reason =
      typeof args.reason === "string" ? args.reason : undefined;

    if (!targetNodeId) {
      return this.failure(ctx, "target_node_id is required");
    }

    const result = this.engine.moveTo(ctx.callSessionId, targetNodeId, reason);

    return {
      output: {
        ok: result.ok,
        message: result.message,
        snapshot: result.snapshot,
      },
    };
  }

  private async handleSearchFaq(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return this.failure(ctx, "query is required");

    const session = this.engine.get(ctx.callSessionId);
    const minScore = session?.compiled.faqMinScore ?? 0.3;

    try {
      const result = await this.ai.answer({
        companyId: ctx.companyId,
        question: query,
        minScore,
      });
      await this.persistFaqUsage(result.data.sources, ctx);
      return {
        output: this.buildSearchOutput(result, ctx, "faq"),
      };
    } catch (err) {
      return this.failure(ctx, (err as Error).message);
    }
  }

  private async handleSearchDocuments(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return this.failure(ctx, "query is required");

    const session = this.engine.get(ctx.callSessionId);
    const minScore = session?.compiled.documentMinScore ?? 0.3;

    try {
      const result = await this.ai.answer({
        companyId: ctx.companyId,
        question: query,
        minScore,
      });
      await this.persistDocumentUsage(result.data.sources, ctx);
      return {
        output: this.buildSearchOutput(result, ctx, "document"),
      };
    } catch (err) {
      return this.failure(ctx, (err as Error).message);
    }
  }

  /**
   * 検索結果を脳向けに整形する。
   * ok を sources の有無で決め、ヒット 0 でも meta (rawHits / topScore / minScore) を
   * 同梱することで「閾値が厳しすぎて弾かれた (topScore が惜しい)」のか「そもそも
   * 知識ベースに該当が無い (rawHits=0 or topScore が大きく下回る)」のかを脳が判断できるようにする。
   */
  private buildSearchOutput(
    result: Awaited<ReturnType<AiService["answer"]>>,
    ctx: ToolContext,
    kind: "faq" | "document"
  ): Record<string, unknown> {
    const sources = result.data.sources;
    const hasSources = sources.length > 0;
    const meta = result.data.meta;
    const label = kind === "faq" ? "FAQ" : "資料";
    const noHitMessage = (() => {
      if (meta.rawHits === 0) {
        return `${label}は登録知識ベースから 1 件も候補が出ませんでした。`;
      }
      const topScore = meta.topScore.toFixed(3);
      return (
        `${label}の候補 ${meta.rawHits} 件のうち、` +
        `フローの閾値 ${meta.minScore} 以上を満たすものがありませんでした (最高 ${topScore})。`
      );
    })();

    return {
      ok: hasSources,
      answer: hasSources ? result.data.answer : noHitMessage,
      sources,
      meta,
      snapshot: this.snapshot(ctx),
    };
  }

  private async handleSendNotification(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    const body = typeof args.body === "string" ? args.body : "";
    if (!body) return this.failure(ctx, "body is required");

    const session = this.engine.get(ctx.callSessionId);
    const target =
      (typeof args.target === "string" && args.target) ||
      session?.defaults.notifyTarget ||
      "";
    const subject =
      typeof args.subject === "string" ? args.subject : "AI通話: 通知";

    this.logger.debug(
      `notification target=${target || "(none)"} subject=${subject} bodyLength=${body.length}`
    );

    if (ctx.callSessionId) {
      try {
        await this.prisma.callSummary.upsert({
          where: { callSessionId: ctx.callSessionId },
          create: {
            callSessionId: ctx.callSessionId,
            summary: `通知送信 → ${target || "(送信先未設定)"}\n件名: ${subject}\n${body}`,
          },
          update: {
            summary: `通知送信 → ${target || "(送信先未設定)"}\n件名: ${subject}\n${body}`,
          },
        });
      } catch (err) {
        this.logger.warn(
          `Failed to persist notification summary: ${(err as Error).message}`
        );
      }
    }

    return {
      output: {
        ok: true,
        target,
        subject,
        snapshot: this.snapshot(ctx),
      },
    };
  }

  private handleRequestTransfer(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolExecutionResult {
    const session = this.engine.get(ctx.callSessionId);
    const to =
      (typeof args.to === "string" && args.to) ||
      session?.defaults.transferTo ||
      "";
    const reason = typeof args.reason === "string" ? args.reason : undefined;

    if (!to) {
      return this.failure(ctx, "転送先が設定されていません");
    }

    this.logger.debug(`request_transfer to=${to} reason=${reason ?? "-"}`);
    return {
      output: {
        ok: true,
        to,
        reason,
        snapshot: this.snapshot(ctx),
      },
      sideEffect: { kind: "transfer", to, reason },
    };
  }

  private handleRequestEndCall(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolExecutionResult {
    const reason = typeof args.reason === "string" ? args.reason : undefined;

    // 同意ガード: end ノード上で end_call を呼ぼうとしている時、直前のユーザー発話が
    // 「終了同意」とみなせる内容かを検証する。end ノードの guidance には毎回
    // 「他にご質問はございますか？で同意を取ってから request_end_call を呼べ」と
    // 書いてあるが、脳が「です。」のような短い・関係ない応答に対しても end_call を
    // 強行することが観測されたため、ここで実際の同意有無をサーバ側で押さえる。
    const session = this.engine.get(ctx.callSessionId);
    const current = session?.currentNodeId
      ? session.compiled.nodes[session.currentNodeId] ?? null
      : null;
    if (current?.type === "end") {
      const lastUser = session?.lastUserTranscript ?? "";
      if (!this.looksLikeEndAgreement(lastUser)) {
        this.logger.warn(
          `request_end_call rejected: 直前ユーザー発話「${lastUser}」が同意として認識されず`
        );
        return {
          output: {
            ok: false,
            error:
              "通話終了の前に、ユーザーが「特にない / 大丈夫 / ありがとう」等で明示的に同意したかを確認してください。" +
              `直前のユーザー発話「${lastUser || "(空)"}」は終了同意とは判断できませんでした。` +
              "もう一度「他にご質問はございますか？」と聞き直し、ユーザーがはっきり同意してから request_end_call を呼んでください。",
            snapshot: this.snapshot(ctx),
          },
        };
      }
    }

    this.engine.markEnded(ctx.callSessionId);
    return {
      output: {
        ok: true,
        reason,
        snapshot: this.snapshot(ctx),
      },
      sideEffect: { kind: "end_call", reason },
    };
  }

  /**
   * 直近ユーザー発話が「通話終了に同意した」と判断できるかをラフに判定する。
   * - 完全一致ではなく部分一致で許す (「いえ、特にないですね」「もう大丈夫です」等)。
   * - 短すぎる発話 (「です」「あ」「うん」単独等) は同意と認めない。
   *   → 「うん」は会話の相槌でも頻出し、終了の意思とは取れないため弾く。
   * - 否定的な「すみませんもう少し聞きたい」等は同意キーワードを含まないので
   *   自然に弾かれる。
   */
  private looksLikeEndAgreement(transcript: string): boolean {
    if (!transcript) return false;
    const normalized = transcript
      .toLowerCase()
      .replace(/[\s。、!?！？.,]/g, "");
    if (normalized.length < 2) return false;

    const agreementMarkers = [
      "ない",
      "ありませ",
      "なしで",
      "なしです",
      "ありがと",
      "大丈夫",
      "結構",
      "けっこう",
      "いえ",
      "いいえ",
      "ok",
      "もう大丈",
      "もういい",
      "もうない",
      "もう結構",
      "それで",
      "それだけ",
      "終わり",
      "おしまい",
      "失礼します",
      "切って",
    ];
    return agreementMarkers.some((marker) =>
      normalized.includes(marker.toLowerCase())
    );
  }

  // ────────────────────────────────────────────
  // 補助
  // ────────────────────────────────────────────

  private snapshot(ctx: ToolContext): FlowSnapshot {
    return this.engine.snapshot(ctx.callSessionId);
  }

  private failure(ctx: ToolContext, error: string): ToolExecutionResult {
    return {
      output: {
        ok: false,
        error,
        snapshot: this.snapshot(ctx),
      },
    };
  }

  private parseArgs(raw: string, name: string): Record<string, unknown> {
    try {
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch (err) {
      this.logger.warn(
        `Failed to parse tool args (${name}): ${(err as Error).message}`
      );
      return {};
    }
  }

  private async persistCollectedSlots(
    callSessionId: string,
    slots: Record<string, string>,
    missingSlots: string[]
  ) {
    try {
      await this.prisma.callSummary.upsert({
        where: { callSessionId },
        create: {
          callSessionId,
          summary:
            missingSlots.length === 0 ? "情報収集完了" : "情報収集中",
          extractedData: slots as object,
        },
        update: {
          summary:
            missingSlots.length === 0 ? "情報収集完了" : "情報収集中",
          extractedData: slots as object,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Failed to persist collected info: ${(err as Error).message}`
      );
    }
  }

  private async persistFaqUsage(
    rawSources: unknown,
    ctx: ToolContext
  ) {
    if (!ctx.callSessionId || !Array.isArray(rawSources)) return;
    const sources = rawSources as KnowledgeSourceLite[];
    const faqIds = this.unique(
      sources
        .filter((source) => source.source === "faq" || source.faqId)
        .map((source) => source.faqId ?? source.id)
        .filter((id): id is string => Boolean(id))
    );
    if (faqIds.length === 0) return;

    try {
      const faqs = await this.prisma.fAQ.findMany({
        where: { id: { in: faqIds }, companyId: ctx.companyId },
        select: { id: true, category: true },
      });
      if (faqs.length === 0) return;

      await Promise.all(
        faqs.map((faq) =>
          this.prisma.callSessionFaq.upsert({
            where: {
              callSessionId_faqId: {
                callSessionId: ctx.callSessionId,
                faqId: faq.id,
              },
            },
            create: { callSessionId: ctx.callSessionId, faqId: faq.id },
            update: {},
          })
        )
      );

      const category =
        faqs.find((faq) => faq.category)?.category ??
        sources.find((source) => source.category)?.category;
      if (category) {
        await this.prisma.callSession.update({
          where: { id: ctx.callSessionId },
          data: { category },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Failed to persist FAQ usage: ${(err as Error).message}`
      );
    }
  }

  private async persistDocumentUsage(
    rawSources: unknown,
    ctx: ToolContext
  ) {
    if (!ctx.callSessionId || !Array.isArray(rawSources)) return;
    const sources = rawSources as KnowledgeSourceLite[];
    const documentIds = this.unique(
      sources
        .filter((source) => source.source === "document" || source.documentId)
        .map((source) => source.documentId ?? source.id)
        .filter((id): id is string => Boolean(id))
    );
    if (documentIds.length === 0) return;

    try {
      const documents = await this.prisma.document.findMany({
        where: { id: { in: documentIds }, companyId: ctx.companyId },
        select: { id: true },
      });

      await Promise.all(
        documents.map((document) =>
          this.prisma.callSessionDocument.upsert({
            where: {
              callSessionId_documentId: {
                callSessionId: ctx.callSessionId,
                documentId: document.id,
              },
            },
            create: {
              callSessionId: ctx.callSessionId,
              documentId: document.id,
            },
            update: {},
          })
        )
      );
    } catch (err) {
      this.logger.warn(
        `Failed to persist document usage: ${(err as Error).message}`
      );
    }
  }

  private unique(values: string[]): string[] {
    return Array.from(new Set(values));
  }
}
