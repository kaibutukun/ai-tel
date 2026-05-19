import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";
import { CollectRequirement } from "../call-flows/flow-compiler.service";

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
  /** 情報収集ノードごとの必須項目 */
  collectRequirements: CollectRequirement[];
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
type DbFaqCandidate = {
  id: string;
  category: string | null;
  question: string;
  answer: string;
};

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
    const to = String(args.to ?? ctx.defaults.transferTo ?? "");
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
    const target = String(args.target ?? ctx.defaults.notifyTarget ?? "");
    const subject = args.subject ? String(args.subject) : "AI通話: 通知";
    const body = String(args.body ?? "");

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
    const submittedFields = args.fields as Record<string, unknown> | undefined;
    if (!submittedFields) {
      return { output: { ok: false, error: "fields is required" } };
    }

    const previousFields = await this.loadCollectedFields(ctx.callSessionId);
    const requirement = this.resolveCollectRequirement(
      { ...previousFields, ...submittedFields },
      submittedFields,
      ctx.collectRequirements
    );
    const fields = {
      ...previousFields,
      ...this.canonicalizeCollectedFields(submittedFields, requirement),
    };
    const requiredFields = requirement?.fields ?? [];
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

  private resolveCollectRequirement(
    mergedFields: Record<string, unknown>,
    submittedFields: Record<string, unknown>,
    requirements: CollectRequirement[]
  ) {
    if (requirements.length === 0) return null;
    if (requirements.length === 1) return requirements[0];

    const submittedNames = Object.keys(submittedFields).map((field) => this.normalizeFieldName(field));
    const mergedNames = Object.keys(mergedFields).map((field) => this.normalizeFieldName(field));

    return requirements
      .map((requirement, index) => {
        const requiredNames = requirement.fields.map((field) => this.normalizeFieldName(field));
        const submittedOverlap = submittedNames.filter((field) => requiredNames.includes(field)).length;
        const mergedOverlap = mergedNames.filter((field) => requiredNames.includes(field)).length;
        return { requirement, index, score: submittedOverlap * 10 + mergedOverlap };
      })
      .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.requirement ?? requirements[0];
  }

  private canonicalizeCollectedFields(
    submittedFields: Record<string, unknown>,
    requirement: CollectRequirement | null
  ) {
    if (!requirement) return submittedFields;

    const canonicalByNormalized = new Map(
      requirement.fields.map((field) => [this.normalizeFieldName(field), field])
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
    const query = String(args.query ?? "");
    if (!query) return { output: { ok: false, error: "query is required" } };

    try {
      // FAQ も Bedrock 検索を共通利用（rag と同じ knowledge base に
      // FAQ も流し込んでいる前提）。閾値は rag の precision を共有。
      const result = await this.ai.answer({
        companyId: ctx.companyId,
        question: query,
        minScore: ctx.ragPrecision,
      });
      if (result.data.sources.length > 0) {
        await this.persistKnowledgeUsage("faq", result.data.sources, ctx);
        return {
          output: {
            ok: true,
            answer: result.data.answer,
            sources: result.data.sources,
          },
        };
      }

      const fallback = await this.lookupFaqFromDatabase(query, ctx);
      await this.persistKnowledgeUsage("faq", fallback.sources, ctx);
      return {
        output: {
          ok: fallback.sources.length > 0,
          answer:
            fallback.answer ??
            "登録FAQに該当する情報が見つかりませんでした。",
          sources: fallback.sources,
        },
      };
    } catch (err) {
      const fallback = await this.lookupFaqFromDatabase(query, ctx);
      await this.persistKnowledgeUsage("faq", fallback.sources, ctx);
      if (fallback.sources.length > 0) {
        return {
          output: {
            ok: true,
            answer: fallback.answer,
            sources: fallback.sources,
          },
        };
      }
      return { output: { ok: false, error: (err as Error).message } };
    }
  }

  private async lookupFaqFromDatabase(query: string, ctx: ToolContext) {
    const faqs = await this.prisma.fAQ.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, category: true, question: true, answer: true },
      take: 100,
    });

    const ranked = faqs
      .map((faq) => ({ faq, score: this.scoreFaqMatch(query, faq) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const top = ranked[0];
    return {
      answer: top?.faq.answer,
      sources: ranked.map(({ faq, score }) => ({
        type: "DATABASE",
        id: faq.id,
        source: "faq",
        faqId: faq.id,
        category: faq.category ?? undefined,
        title: faq.category ? `FAQ（${faq.category}）` : "FAQ",
        score,
        excerpt: `質問: ${faq.question}\n回答: ${faq.answer}`.slice(0, 240),
      })),
    };
  }

  private scoreFaqMatch(query: string, faq: DbFaqCandidate) {
    const normalizedQuery = this.normalizeForSearch(query);
    if (!normalizedQuery) return 0;

    const haystack = this.normalizeForSearch(
      [faq.category, faq.question, faq.answer].filter(Boolean).join(" ")
    );
    if (!haystack) return 0;

    let score = 0;
    if (haystack.includes(normalizedQuery)) score += 1;
    if (faq.category && normalizedQuery.includes(this.normalizeForSearch(faq.category))) {
      score += 0.35;
    }

    const grams = this.ngrams(normalizedQuery, normalizedQuery.length <= 4 ? 2 : 3);
    if (grams.length > 0) {
      const hits = grams.filter((gram) => haystack.includes(gram)).length;
      score += hits / grams.length;
    }

    return Number(score.toFixed(3));
  }

  private normalizeForSearch(value: string) {
    return value
      .toLowerCase()
      .replace(/[\s　:：・,，、。.!！?？「」『』（）()【】\[\]\-ー]/g, "")
      .trim();
  }

  private ngrams(value: string, size: number) {
    if (value.length < size) return value ? [value] : [];
    const grams: string[] = [];
    for (let i = 0; i <= value.length - size; i += 1) {
      grams.push(value.slice(i, i + size));
    }
    return Array.from(new Set(grams));
  }

  private async handleLookupDocuments(
    args: Record<string, unknown>,
    ctx: ToolContext
  ): Promise<ToolExecutionResult> {
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
