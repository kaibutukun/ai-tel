import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class AdminCallSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    options: {
      page?: number;
      limit?: number;
      companyId?: string;
      from?: string;
      to?: string;
    } = {}
  ) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 30;
    const skip = (page - 1) * limit;

    const startedAt = this.buildDateRange(options.from, options.to);
    const where = {
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(startedAt ? { startedAt } : {}),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.callSession.findMany({
        where,
        include: {
          company: { select: { id: true, name: true } },
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
      data: sessions.map((s) => this.withDerivedDuration(s)),
      meta: { total, page, limit },
    };
  }

  async findOne(id: string) {
    const session = await this.prisma.callSession.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true } },
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

  private withDerivedDuration<
    T extends {
      startedAt: Date;
      endedAt?: Date | null;
      durationSeconds?: number | null;
    }
  >(session: T): T {
    if (session.durationSeconds != null || !session.endedAt) return session;
    return {
      ...session,
      durationSeconds: Math.max(
        0,
        Math.round(
          (session.endedAt.getTime() - session.startedAt.getTime()) / 1000
        )
      ),
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
}
