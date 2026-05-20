import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import type { ActionType } from "../call-flows/flow-types";

// ─────────────────────────────────────────────────────────────
// ToolExecutorService
//
// OpenAI Realtime から飛んでくる function call を実際に処理する場所。
// 副作用（DB書き込み・転送指示・通知）はここに集約する。
//
// 戻り値は OpenAI に function_call_output として戻すため、必ず JSON
// シリアライズ可能な形にすること。
// ─────────────────────────────────────────────────────────────

export interface ToolContext {
  companyId: string;
  callSessionId: string | null;
  callFlowId: string | null;
  callerNumber?: string;
  /** transfer 等のために台本に書かれている既定値 */
  defaults: {
    transferTo?: string;
    notifyTarget?: string;
  };
  /** rag ノードに設定された "正確さ" の閾値 (0.5〜0.9) */
  ragPrecision: number;
  /** Brain が現在いる action node。ツールの既定値と必須項目はここから解決する。 */
  activeAction?: ToolActiveAction;
}

export interface ToolActiveAction {
  nodeId: string;
  type: ActionType;
  fields?: string[];
  target?: string;
}

export interface ToolCallPayload {
  callId: string;
  name: string;
  arguments: string;
}

export interface ToolExecutionResult {
  /** モデルへ返す結果（function_call_output） */
  output: Record<string, unknown>;
  /** 通話側で取るべきアクション（呼び出し側で判定する） */
  sideEffect?:
    | { kind: "transfer"; to: string; reason?: string }
    | { kind: "end_call"; reason?: string };
}

type KnowledgeToolSource = {
  id?: string;
  source?: string;
  faqId?: string;
  documentId?: string;
  category?: string;
  title?: string;
  score?: number;
};

type KnowledgeUsageContext = Pick<ToolContext, "companyId" | "callSessionId">;

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService
  ) {}

  async execute(call: ToolCallPayload, ctx: ToolContext): Promise<ToolExecutionResult> {
    let args: Record<string, unknown> = {};
    try {
      args = call.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : {};
    } catch (err) {
      this.logger.warn(`Failed to parse tool args (${call.name}): ${(err as Error).message}`);
    }

    switch (call.name) {
      case "transfer_call":
        return this.handleTransferCall(args, ctx);
      case "send_notification":
        return this.handleSendNotification(args, ctx);
      case "submit_collected_info":
        return this.handleSubmitCollected(args, ctx);
      case "lookup_faq":
        return this.handleLookupFaq(args, ctx);
      case "lookup_documents":
        return this.handleLookupDocuments(args, ctx);
      case "end_call":
        return this.handleEndCall(args);
      default:
        this.logger.warn(`Unknown tool call: ${call.name}`);
        return { output: { ok: false, error: `unknown tool: ${call.name}` } };
    }
  }

  // ────────────────────────────────────────────

  private handleTransferCall(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): ToolExecutionResult {
    if (ctx.activeAction?.type !== "transfer") {
      return { output: { ok: false, error: "transfer_call is not active for current node" } };
    }

    const to = String(args.to ?? ctx.activeAction.target ?? ctx.defaults.transferTo ?? "");
    const reason = args.reason ? String(args.reason) : undefined;
    if (!to) {
      return { output: { ok: false, error: "転送先が設定されていません" } };
    }
    this.logger.log(`transfer_call to=${to} reason=${reason ?? "-"}`);
    return {
      output: { ok: true, to, reason },
      sideEffect: { kind: "transfer", to, reason },
    };
  }

  private async handleSendNotification(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    if (ctx.activeAction?.type !== "notify") {
      return { output: { ok: false, error: "send_notification is not active for current node" } };
    }

    const target = String(args.target ?? ctx.activeAction.target ?? ctx.defaults.notifyTarget ?? "");
    const subject = args.subject ? String(args.subject) : "AI通話: 通知";
    const body = String(args.body ?? "");

    if (!target) {
      return { output: { ok: false, error: "通知先が設定されていません" } };
    }

    // 実際の送信プロバイダ統合（メール/Slack）は今後実装。現状はログ記録のみ。
    this.logger.log(
      `notification target=${target} subject=${subject} bodyLength=${body.length}`
    );

    // 通話セッションへサマリーとして残しておく（ベストエフォート）
    if (ctx.callSessionId) {
      try {
        await this.prisma.callSummary.upsert({
          where: { callSessionId: ctx.callSessionId },
          create: {
            callSessionId: ctx.callSessionId,
            summary: `通知送信 → ${target}\n件名: ${subject}\n${body}`,
          },
          update: {
            summary: `通知送信 → ${target}\n件名: ${subject}\n${body}`,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to persist notification summary: ${(err as Error).message}`);
      }
    }

    return { output: { ok: true, target, subject } };
  }

  private async handleSubmitCollected(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    if (ctx.activeAction?.type !== "collect") {
      return {
        output: { ok: false, error: "submit_collected_info is not active for current node" },
      };
    }

    const submittedFields = args.fields as Record<string, unknown> | undefined;
    if (!submittedFields) {
      return { output: { ok: false, error: "fields is required" } };
    }

    const previousFields = await this.loadCollectedFields(ctx.callSessionId);
    const requiredFields = (ctx.activeAction.fields ?? []).filter(Boolean);
    const fields = {
      ...previousFields,
      ...this.canonicalizeCollectedFields(submittedFields, requiredFields),
    };
    const missingFields = requiredFields.filter((field) => !this.hasCollectedValue(fields[field]));

    if (ctx.callSessionId) {
      try {
        await this.prisma.callSummary.upsert({
          where: { callSessionId: ctx.callSessionId },
          create: {
            callSessionId: ctx.callSessionId,
            summary: missingFields.length === 0 ? "情報収集完了" : "情報収集中",
            extractedData: fields as object,
          },
          update: {
            summary: missingFields.length === 0 ? "情報収集完了" : "情報収集中",
            extractedData: fields as object,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to persist collected info: ${(err as Error).message}`);
      }
    }

    if (missingFields.length > 0) {
      return {
        output: {
          ok: false,
          fields,
          requiredFields,
          missingFields,
          message: `未確認の項目があります: ${missingFields.join("、")}`,
        },
      };
    }

    return { output: { ok: true, fields, requiredFields, missingFields: [] } };
  }

  private async loadCollectedFields(callSessionId: string | null) {
    if (!callSessionId) return {};
    try {
      const summary = await this.prisma.callSummary.findUnique({
        where: { callSessionId },
        select: { extractedData: true },
      });
      const data = summary?.extractedData;
      if (!data || typeof data !== "object" || Array.isArray(data)) return {};
      return data as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`Failed to load collected info: ${(err as Error).message}`);
      return {};
    }
  }

  private canonicalizeCollectedFields(
    submittedFields: Record<string, unknown>,
    requiredFields: string[]
  ) {
    if (requiredFields.length === 0) return submittedFields;

    const canonicalByNormalized = new Map(
      requiredFields.map((field) => [this.normalizeFieldName(field), field])
    );

    return Object.fromEntries(
      Object.entries(submittedFields).map(([key, value]) => [
        canonicalByNormalized.get(this.normalizeFieldName(key)) ?? key,
        value,
      ])
    );
  }

  private hasCollectedValue(value: unknown) {
    if (typeof value === "string") return value.trim().length > 0;
    return value !== null && value !== undefined;
  }

  private normalizeFieldName(value: string) {
    return value
      .replace(/[\s　:：・,，、。]/g, "")
      .replace(/^[おご御]/, "");
  }

  private async handleLookupFaq(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    if (ctx.activeAction?.type !== "faq") {
      return { output: { ok: false, error: "lookup_faq is not active for current node" } };
    }

    const query = String(args.query ?? "");
    if (!query) return { output: { ok: false, error: "query is required" } };

    try {
      const result = await this.ai.answer({
        companyId: ctx.companyId,
        question: query,
        minScore: ctx.ragPrecision,
      });
      await this.persistKnowledgeUsage("faq", result.data.sources, ctx);
      return {
        output: {
          ok: result.data.sources.length > 0,
          answer: result.data.answer,
          sources: result.data.sources,
        },
      };
    } catch (err) {
      return { output: { ok: false, error: (err as Error).message } };
    }
  }

  private async handleLookupDocuments(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
    if (ctx.activeAction?.type !== "rag") {
      return { output: { ok: false, error: "lookup_documents is not active for current node" } };
    }

    const query = String(args.query ?? "");
    if (!query) return { output: { ok: false, error: "query is required" } };

    try {
      const result = await this.ai.answer({
        companyId: ctx.companyId,
        question: query,
        minScore: ctx.ragPrecision,
      });
      await this.persistKnowledgeUsage("document", result.data.sources, ctx);
      return {
        output: {
          ok: true,
          answer: result.data.answer,
          sources: result.data.sources,
        },
      };
    } catch (err) {
      return { output: { ok: false, error: (err as Error).message } };
    }
  }

  private handleEndCall(args: Record<string, unknown>): ToolExecutionResult {
    const reason = args.reason ? String(args.reason) : undefined;
    return {
      output: { ok: true },
      sideEffect: { kind: "end_call", reason },
    };
  }

  private async persistKnowledgeUsage(
    mode: "faq" | "document",
    rawSources: unknown,
    ctx: KnowledgeUsageContext
  ) {
    if (!ctx.callSessionId || !Array.isArray(rawSources)) return;
    const sources = rawSources as KnowledgeToolSource[];

    if (mode === "faq") {
      await this.persistFaqUsage(sources, ctx);
      return;
    }

    await this.persistDocumentUsage(sources, ctx);
  }

  private async persistFaqUsage(sources: KnowledgeToolSource[], ctx: KnowledgeUsageContext) {
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
                callSessionId: ctx.callSessionId!,
                faqId: faq.id,
              },
            },
            create: { callSessionId: ctx.callSessionId!, faqId: faq.id },
            update: {},
          })
        )
      );

      const category =
        faqs.find((faq) => faq.category)?.category ??
        sources.find((source) => source.category)?.category;
      if (category) {
        await this.prisma.callSession.update({
          where: { id: ctx.callSessionId! },
          data: { category },
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to persist FAQ usage: ${(err as Error).message}`);
    }
  }

  private async persistDocumentUsage(sources: KnowledgeToolSource[], ctx: KnowledgeUsageContext) {
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
                callSessionId: ctx.callSessionId!,
                documentId: document.id,
              },
            },
            create: { callSessionId: ctx.callSessionId!, documentId: document.id },
            update: {},
          })
        )
      );
    } catch (err) {
      this.logger.warn(`Failed to persist document usage: ${(err as Error).message}`);
    }
  }

  private unique(values: string[]) {
    return Array.from(new Set(values));
  }
}
