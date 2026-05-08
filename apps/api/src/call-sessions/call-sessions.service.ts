import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

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
      data: sessions,
      meta: { total, page, limit },
    };
  }

  /** 通話詳細（書き起こし・サマリー・使用FAQ/ドキュメントを含む） */
  async findOne(id: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id },
      include: {
        phoneNumber: { select: { number: true, displayName: true } },
        callFlow: { select: { name: true } },
        transcripts: { orderBy: { timestamp: "asc" } },
        summaries: true,
        sessionFaqs: { include: { faq: { select: { question: true } } } },
        sessionDocs: { include: { document: { select: { name: true } } } },
      },
    });
    if (!session) throw new NotFoundException("通話セッションが見つかりません");
    return { data: session };
  }
}
