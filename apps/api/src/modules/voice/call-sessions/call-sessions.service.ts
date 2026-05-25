import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class CallSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 通話ログ一覧（コアロジックで書き込まれたデータを読み取るのみ）
   * ページネーション + フロー / 期間で絞り込み可能
   */
  async findAll(
    companyId: string,
    options: {
      page?: number;
      limit?: number;
      callFlowId?: string;
      from?: string;
      to?: string;
    } = {}
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const startedAt = this.buildDateRange(options.from, options.to);
    const where = {
      companyId,
      ...(options.callFlowId ? { callFlowId: options.callFlowId } : {}),
      ...(startedAt ? { startedAt } : {}),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.callSession.findMany({
        where,
        include: {
          phoneNumber: { select: { number: true, displayName: true } },
          callFlow: { select: { name: true } },
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.callSession.count({ where }),
    ]);

    return {
      data: sessions.map((session) => this.withDerivedDuration(session)),
      meta: { total, page, limit },
    };
  }

  private buildDateRange(from?: string, to?: string) {
    const gte = from ? new Date(from) : undefined;
    const lte = to ? new Date(to) : undefined;
    if (gte && Number.isNaN(gte.getTime())) {
      throw new BadRequestException("from の日付形式が不正です");
    }
    if (lte && Number.isNaN(lte.getTime())) {
      throw new BadRequestException("to の日付形式が不正です");
    }
    if (!gte && !lte) return null;
    return {
      ...(gte ? { gte } : {}),
      ...(lte ? { lte } : {}),
    };
  }

  /** 通話詳細（書き起こし・サマリー・使用FAQを含む） */
  async findOne(id: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id },
      include: {
        phoneNumber: { select: { number: true, displayName: true } },
        callFlow: { select: { name: true } },
        transcripts: { orderBy: { timestamp: "asc" } },
        summaries: true,
        sessionFaqs: { include: { faq: { select: { question: true } } } },
      },
    });
    if (!session) throw new NotFoundException("通話セッションが見つかりません");
    return { data: this.withDerivedDuration(session) };
  }

  private withDerivedDuration<T extends { startedAt: Date; endedAt?: Date | null; durationSeconds?: number | null }>(
    session: T
  ): T {
    if (session.durationSeconds != null || !session.endedAt) return session;
    return {
      ...session,
      durationSeconds: Math.max(
        0,
        Math.round((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
      ),
    };
  }
}
