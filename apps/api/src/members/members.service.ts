import {
  Injectable,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";

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
  constructor(private readonly prisma: PrismaService) {}

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
   * - 既存ユーザーならそのまま追加、新規ならユーザーレコードを作成してから追加
   * - 既にメンバーの場合は 409 を返す
   */
  async invite(dto: CreateMemberDto) {
    // メールアドレスでユーザーを検索、なければ新規作成
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      user = await this.prisma.user.create({
        data: { email: dto.email, name: dto.name },
      });
    }

    // 既にメンバー登録済みか確認
    const existing = await this.prisma.companyMember.findUnique({
      where: {
        companyId_userId: { companyId: dto.companyId, userId: user.id },
      },
    });
    if (existing) {
      throw new ConflictException(
        "このメールアドレスは既にメンバーとして登録されています"
      );
    }

    const member = await this.prisma.companyMember.create({
      data: {
        companyId: dto.companyId,
        userId: user.id,
        role: dto.role as Role,
        joinedAt: new Date(),
      },
      include: { user: true },
    });

    return { data: formatMember(member) };
  }

  /** メンバーのロールを変更する */
  async updateRole(memberId: string, dto: UpdateMemberRoleDto) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException("メンバーが見つかりません");
    }

    const updated = await this.prisma.companyMember.update({
      where: { id: memberId },
      data: { role: dto.role as Role },
      include: { user: true },
    });

    return { data: formatMember(updated) };
  }

  /** メンバーを削除する（CompanyMember レコードのみ削除、User は残す） */
  async remove(memberId: string) {
    const member = await this.prisma.companyMember.findUnique({
      where: { id: memberId },
    });
    if (!member) {
      throw new NotFoundException("メンバーが見つかりません");
    }

    await this.prisma.companyMember.delete({ where: { id: memberId } });
    return { data: { message: "メンバーを削除しました" } };
  }
}
