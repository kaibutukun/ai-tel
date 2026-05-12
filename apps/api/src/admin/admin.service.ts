import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePhoneNumberDto } from "../phone-numbers/dto/create-phone-number.dto";
import { AssignPhoneNumberDto } from "./dto/assign-phone-number.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdatePhoneNumberRequestDto } from "./dto/update-phone-number-request.dto";

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

  /** 運営管理者向け: NTT CPaaS 番号在庫と割当状況を一覧する */
  async findAllPhoneNumbers() {
    const phoneNumbers = await this.prisma.phoneNumber.findMany({
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
      orderBy: [{ companyId: "asc" }, { createdAt: "desc" }],
    });
    return { data: phoneNumbers, meta: { total: phoneNumbers.length } };
  }

  /**
   * 運営管理者向け: NTT CPaaS で取得済みの番号を在庫登録する。
   * companyId を渡すと登録と同時に会社へ割り当てる。
   */
  async createPhoneNumber(dto: CreatePhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({
      where: { number: dto.number },
    });
    if (existing) throw new ConflictException("この電話番号はすでに登録されています");

    await this.assertCompanyAndFlow(dto.companyId, dto.callFlowId);

    const phoneNumber = await this.prisma.phoneNumber.create({
      data: {
        companyId: dto.companyId || null,
        number: dto.number,
        displayName: dto.displayName,
        providerNumberId: dto.providerNumberId,
        provider: "ntt-cpaas",
        transferTo: dto.transferTo,
        isActive: dto.isActive ?? true,
        callFlowId: dto.companyId ? dto.callFlowId : null,
      },
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
    });

    return { data: phoneNumber };
  }

  /** 運営管理者向け: 番号在庫を会社へ割当/未割当へ戻す */
  async assignPhoneNumber(id: string, dto: AssignPhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("電話番号が見つかりません");

    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
        select: { id: true },
      });
      if (!company) throw new NotFoundException("会社が見つかりません");
    }

    const phoneNumber = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        companyId: dto.companyId || null,
        // 未割当へ戻す場合、会社依存の設定は残さない。
        callFlowId: dto.companyId ? existing.callFlowId : null,
        transferTo: dto.companyId ? existing.transferTo : null,
      },
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
    });
    return { data: phoneNumber };
  }

  /** 運営管理者向け: 会社からの番号追加リクエスト一覧 */
  async findPhoneNumberRequests() {
    const requests = await this.prisma.phoneNumberRequest.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: requests, meta: { total: requests.length } };
  }

  /** 運営管理者向け: リクエストの対応状況を更新する */
  async updatePhoneNumberRequest(id: string, dto: UpdatePhoneNumberRequestDto) {
    const existing = await this.prisma.phoneNumberRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("リクエストが見つかりません");

    const request = await this.prisma.phoneNumberRequest.update({
      where: { id },
      data: dto,
      include: { company: { select: { id: true, name: true } } },
    });
    return { data: request };
  }

  private async assertCompanyAndFlow(companyId?: string, callFlowId?: string) {
    if (!companyId && callFlowId) {
      throw new BadRequestException("未割当番号には対応フローを設定できません");
    }

    if (!companyId) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException("会社が見つかりません");

    if (!callFlowId) return;

    const callFlow = await this.prisma.callFlow.findFirst({
      where: { id: callFlowId, companyId },
      select: { id: true },
    });
    if (!callFlow) {
      throw new BadRequestException("指定された対応フローが会社に紐づいていません");
    }
  }
}
