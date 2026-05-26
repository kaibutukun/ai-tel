import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { InvitationsService } from "../../identity/invitations/invitations.service";
import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { JwtPayload } from "../../../common/types/authenticated-request";

// DB から取得した CompanyMember+User を API レスポンス形式に整形
function formatMember(m: {
  id: string;
  role: Role;
  joinedAt: Date | null;
  isActive: boolean;
  user: { name: string; email: string; avatarUrl: string | null };
}) {
  return {
    id: m.id,
    name: m.user.name,
    email: m.user.email,
    avatarUrl: m.user.avatarUrl,
    role: m.role,
    joinedAt: m.joinedAt?.toISOString().slice(0, 10) ?? null,
    isActive: m.isActive,
  };
}

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService
  ) {}

  /** 指定会社のメンバー一覧を取得 */
  async findAll(companyId: string) {
    const members = await this.prisma.companyMember.findMany({
      where: { companyId },
      include: { user: true },
      orderBy: { invitedAt: "asc" },
    });

    return {
      data: members.map(formatMember),
      meta: { total: members.length },
    };
  }

  /**
   * メンバーを招待する
   * - 呼び出し元が招待先企業の ADMIN でなければ 403
   * - 同じ会社の既存メンバーなら 409
   * - 他企業のメンバーになっている email なら 409（1ユーザー=1企業の方針）
   */
  async invite(
    dto: CreateMemberDto,
    requester: JwtPayload,
    origin: string | undefined
  ) {
    this.ensureCompanyAdmin(requester, dto.companyId);

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { companyMembers: true },
    });

    if (existing) {
      const sameCompany = existing.companyMembers.find(
        (m) => m.companyId === dto.companyId
      );
      if (sameCompany) {
        throw new ConflictException(
          "このメールアドレスは既にこの会社のメンバーです"
        );
      }
      if (existing.companyMembers.length > 0) {
        throw new ConflictException(
          "このメールアドレスは既に別企業のメンバーです"
        );
      }
    }

    const user =
      existing ??
      (await this.prisma.user.create({
        data: { email: dto.email, name: dto.name },
      }));

    const member = await this.prisma.companyMember.create({
      data: {
        companyId: dto.companyId,
        userId: user.id,
        role: dto.role as Role,
        joinedAt: null,
      },
      include: { user: true },
    });

    const invitation = await this.invitations.issue(
      user.id,
      dto.companyId,
      dto.role as Role
    );

    return {
      data: formatMember(member),
      invitation: {
        token: invitation.token,
        url: this.invitations.buildInvitationUrl(invitation.token, origin),
        expiresAt: invitation.expiresAt.toISOString(),
      },
    };
  }

  /** メンバーのロールを変更する（呼び出し元が同企業の ADMIN である必要あり） */
  async updateRole(
    memberId: string,
    dto: UpdateMemberRoleDto,
    requester: JwtPayload
  ) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException("メンバーが見つかりません");
    }
    this.ensureCompanyAdmin(requester, member.companyId);

    const updated = await this.prisma.companyMember.update({
      where: { id: memberId },
      data: { role: dto.role as Role },
      include: { user: true },
    });

    return { data: formatMember(updated) };
  }

  /**
   * メンバーを削除する（CompanyMember レコードのみ削除、User は残す）
   * - 呼び出し元が同企業の ADMIN でなければ 403
   * - 自分自身を削除しようとした場合は 400
   */
  async remove(memberId: string, requester: JwtPayload) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException("メンバーが見つかりません");
    }
    this.ensureCompanyAdmin(requester, member.companyId);

    if (member.userId === requester.sub) {
      throw new ForbiddenException("自分自身を削除することはできません");
    }

    await this.prisma.companyMember.delete({ where: { id: memberId } });
    return { data: { message: "メンバーを削除しました" } };
  }

  /**
   * 既存メンバーへの招待リンクを再発行する。
   * - 呼び出し元が同企業の ADMIN でなければ 403
   * - passwordHash 設定済みなら 409
   */
  async resendInvitation(
    memberId: string,
    requester: JwtPayload,
    origin: string | undefined
  ) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member) {
      throw new NotFoundException("メンバーが見つかりません");
    }
    this.ensureCompanyAdmin(requester, member.companyId);

    if (member.user.passwordHash) {
      throw new ConflictException(
        "このユーザーはすでにパスワードを設定済みです"
      );
    }

    const invitation = await this.invitations.issue(
      member.userId,
      member.companyId,
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

  /**
   * 呼び出し元が指定会社の ADMIN かを確認。
   * 運営者（adminRole=true）は会社内ロールに関わらず通す。
   */
  private ensureCompanyAdmin(requester: JwtPayload, companyId: string) {
    if (requester.adminRole) return;
    if (requester.companyId !== companyId || requester.role !== "ADMIN") {
      throw new ForbiddenException("この操作には管理者権限が必要です");
    }
  }
}
