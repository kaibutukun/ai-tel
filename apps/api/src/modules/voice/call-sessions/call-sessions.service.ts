import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class CallSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 通話ログ一覧（コアロジックで書き込まれたデータを読み取るのみ）
   * ページネーション対応: page/limit クエリ
   */
  async findAll(companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [sessions, total] = await Promise.all([
      this.prisma.callSession.findMany({
        where: { companyId },
        include: {
          phoneNumber: { select: { number: true, displayName: true } },
          callFlow: { select: { name: true } },
        },
        orderBy: { startedAt: "desc" },
        skip,
        take: limit,
      }),
      this.prisma.callSession.count({ where: { companyId } }),
    ]);

    return {
      data: sessions.map((session) => this.withDerivedDuration(session)),
      meta: { total, page, limit },
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
