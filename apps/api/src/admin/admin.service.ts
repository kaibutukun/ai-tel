import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateCompanyDto } from "./dto/update-company.dto";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 全企業の一覧 + 今月の利用状況 + プラット幅広いサマリー統計
   */
  async findAllCompanies() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const companies = await this.prisma.company.findMany({
      include: {
        subscription: { include: { plan: true } },
        usageRecords: { where: { year, month } },
        invoices: {
          where: { year, month },
          select: { status: true, total: true },
        },
        _count: { select: { phoneNumbers: true, members: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    // プラットフォーム全体の集計
    const totalMRR = companies.reduce(
      (sum, c) => sum + (c.subscription?.plan?.priceMonthly ?? 0),
      0
    );
    const totalCalls = companies.reduce(
      (sum, c) => sum + (c.usageRecords[0]?.totalCalls ?? 0),
      0
    );
    const totalMinutes = companies.reduce(
      (sum, c) => sum + (c.usageRecords[0]?.totalMinutes ?? 0),
      0
    );

    return {
      data: companies.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        isActive: c.isActive,
        createdAt: c.createdAt.toISOString().slice(0, 10),
        plan: c.subscription?.plan?.name ?? "なし",
        planType: c.subscription?.plan?.type ?? null,
        priceMonthly: c.subscription?.plan?.priceMonthly ?? 0,
        callsThisMonth: c.usageRecords[0]?.totalCalls ?? 0,
        minutesThisMonth: c.usageRecords[0]?.totalMinutes ?? 0,
        phoneNumbersCount: c._count.phoneNumbers,
        memberCount: c._count.members,
        billingStatus: c.invoices[0]?.status ?? "NONE",
      })),
      meta: { total: companies.length },
      stats: {
        totalCompanies: companies.length,
        activeCompanies: companies.filter((c) => c.isActive).length,
        totalMRR,
        totalCalls,
        totalMinutes,
      },
    };
  }

  /** 企業詳細（請求履歴・メンバー・電話番号含む） */
  async findCompany(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        members: { include: { user: true } },
        phoneNumbers: true,
        invoices: {
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 12,
        },
        usageRecords: {
          orderBy: [{ year: "desc" }, { month: "desc" }],
          take: 12,
        },
        _count: { select: { callSessions: true, faqs: true, documents: true } },
      },
    });
    if (!company) throw new NotFoundException("企業が見つかりません");
    return { data: company };
  }

  /** 企業情報を更新（有効/無効切替・管理者メモ） */
  async updateCompany(id: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("企業が見つかりません");

    const company = await this.prisma.company.update({
      where: { id },
      data: dto,
    });
    return { data: company };
  }
}
