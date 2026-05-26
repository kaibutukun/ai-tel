import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PlanType, Role } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { InvitationsService } from "../../identity/invitations/invitations.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdateCompanyPlanDto } from "./dto/update-company-plan.dto";

@Injectable()
export class AdminCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService
  ) {}

  /**
   * 全企業の一覧 + 今月の利用状況 + プラットフォーム全体のサマリー統計。
   */
  async findAll() {
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

    const totalMRR = companies.reduce(
      (sum, c) => sum + (c.subscription?.monthlyPrice ?? 0),
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
        monthlyPrice: c.subscription?.monthlyPrice ?? 0,
        maxMinutesPerMonth: c.subscription?.maxMinutesPerMonth ?? 0,
        trialEndsAt: c.subscription?.trialEndsAt?.toISOString() ?? null,
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

  /** 企業詳細（請求履歴・メンバー・電話番号を含む） */
  async findOne(id: string) {
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

    // メンバーは passwordHash を露出しない形に整形 + hasPassword フラグを付与
    const { members, ...rest } = company;
    return {
      data: {
        ...rest,
        members: members.map((m) => ({
          id: m.id,
          role: m.role,
          joinedAt: m.joinedAt,
          isActive: m.isActive,
          invitedAt: m.invitedAt,
          hasPassword: !!m.user.passwordHash,
          user: {
            id: m.user.id,
            name: m.user.name,
            email: m.user.email,
            avatarUrl: m.user.avatarUrl,
          },
        })),
      },
    };
  }

  /** 企業情報を更新（有効/無効切替・管理者メモ） */
  async update(id: string, dto: UpdateCompanyDto) {
    const existing = await this.prisma.company.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("企業が見つかりません");

    const company = await this.prisma.company.update({
      where: { id },
      data: dto,
    });
    return { data: company };
  }

  /**
   * 会社ごとのプラン設定を更新する。
   * Subscription が無い会社には新規作成し、あれば上書きする。
   */
  async updatePlan(id: string, dto: UpdateCompanyPlanDto) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: { subscription: true },
    });
    if (!company) throw new NotFoundException("企業が見つかりません");

    const plan = await this.prisma.plan.findUnique({
      where: { type: dto.planType },
    });
    if (!plan) {
      throw new NotFoundException(`プラン ${dto.planType} が存在しません`);
    }

    const subscriptionData = {
      planId: plan.id,
      monthlyPrice: dto.planType === "PAID" ? dto.monthlyPrice : 0,
      maxMinutesPerMonth: dto.maxMinutesPerMonth,
      trialEndsAt: dto.trialEndsAt ? new Date(dto.trialEndsAt) : null,
    };

    if (company.subscription) {
      const updated = await this.prisma.subscription.update({
        where: { companyId: id },
        data: subscriptionData,
        include: { plan: true },
      });
      return { data: updated };
    }

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const created = await this.prisma.subscription.create({
      data: {
        companyId: id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        ...subscriptionData,
      },
      include: { plan: true },
    });
    return { data: created };
  }

  /**
   * 企業 + 初代 ADMIN ユーザー + Subscription を一括作成し、招待 URL を返す。
   * - 既存メールが別企業のメンバーになっている場合は 409（1ユーザー=1企業の方針）
   * - slug は内部識別子としてランダム生成（UI からは指定しない）
   */
  async create(dto: CreateCompanyDto, origin: string | undefined) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.adminEmail },
      include: { companyMembers: true },
    });
    if (existingUser && existingUser.companyMembers.length > 0) {
      throw new ConflictException(
        "このメールアドレスは既に別企業のメンバーです"
      );
    }

    const plan = await this.prisma.plan.findUnique({
      where: { type: dto.planType },
    });
    if (!plan) {
      throw new NotFoundException(`プラン ${dto.planType} が存在しません`);
    }

    const endsAt = dto.trialEndsAt ? new Date(dto.trialEndsAt) : null;

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const slug = `co-${randomBytes(6).toString("hex")}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.name, slug },
      });

      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { name: dto.adminName },
          })
        : await tx.user.create({
            data: { email: dto.adminEmail, name: dto.adminName },
          });

      await tx.companyMember.create({
        data: {
          companyId: company.id,
          userId: user.id,
          role: Role.ADMIN,
          joinedAt: null,
        },
      });

      await tx.subscription.create({
        data: {
          companyId: company.id,
          planId: plan.id,
          monthlyPrice: dto.planType === PlanType.PAID ? dto.monthlyPrice : 0,
          maxMinutesPerMonth: dto.maxMinutesPerMonth,
          trialEndsAt: endsAt,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
        },
      });

      return { company, user };
    });

    const invitation = await this.invitations.issue(
      result.user.id,
      result.company.id,
      Role.ADMIN
    );

    return {
      data: {
        company: result.company,
        admin: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
        },
        invitation: {
          token: invitation.token,
          url: this.invitations.buildInvitationUrl(invitation.token, origin),
          expiresAt: invitation.expiresAt.toISOString(),
        },
      },
    };
  }

  /**
   * 指定企業の指定メンバー宛に、招待リンクを再発行する。
   * - すでにパスワード設定済み（passwordHash あり）なら 409
   */
  async resendInvitation(
    companyId: string,
    memberId: string,
    origin: string | undefined
  ) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member || member.companyId !== companyId) {
      throw new NotFoundException("メンバーが見つかりません");
    }
    if (member.user.passwordHash) {
      throw new ConflictException(
        "このユーザーはすでにパスワードを設定済みです"
      );
    }

    const invitation = await this.invitations.issue(
      member.userId,
      companyId,
      member.role
    );

    return {
      data: {
        invitation: {
          token: invitation.token,
          url: this.invitations.buildInvitationUrl(invitation.token, origin),
          expiresAt: invitation.expiresAt.toISOString(),
        },
      },
    };
  }
}
