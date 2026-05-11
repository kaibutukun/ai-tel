import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AiService } from "../ai/ai.service";

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
    const fields = args.fields as Record<string, unknown> | undefined;
    if (!fields) {
      return { output: { ok: false, error: "fields is required" } };
    }
    if (ctx.callSessionId) {
      try {
        await this.prisma.callSummary.upsert({
          where: { callSessionId: ctx.callSessionId },
          create: {
            callSessionId: ctx.callSessionId,
            summary: "情報収集完了",
            extractedData: fields as object,
          },
          update: {
            extractedData: fields as object,
          },
        });
      } catch (err) {
        this.logger.warn(`Failed to persist collected info: ${(err as Error).message}`);
      }
    }
    return { output: { ok: true, fields } };
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
}
