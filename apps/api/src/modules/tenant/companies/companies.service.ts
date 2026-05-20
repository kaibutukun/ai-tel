import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 全会社の一覧（管理画面用） */
  async findAll() {
    const companies = await this.prisma.company.findMany({
      include: {
        _count: {
          select: { members: true, phoneNumbers: true, callSessions: true },
        },
        subscription: { include: { plan: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return { data: companies, meta: { total: companies.length } };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        members: { include: { user: true } },
        phoneNumbers: true,
        subscription: { include: { plan: true } },
        _count: { select: { callSessions: true, faqs: true, documents: true } },
      },
    });
    if (!company) throw new NotFoundException("会社が見つかりません");
    return { data: company };
  }
}
