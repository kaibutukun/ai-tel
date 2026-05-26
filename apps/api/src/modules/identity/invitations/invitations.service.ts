import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes } from "crypto";
import { Role } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { hashPassword } from "../auth/auth.service";

const INVITATION_TTL_DAYS = 7;

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  /**
   * 指定ユーザー宛に招待トークンを発行する。
   * 同じユーザーの既存・未使用トークンは失効させる（最新のリンクだけ有効にする）。
   */
  async issue(userId: string, companyId: string, role: Role) {
    await this.prisma.invitation.updateMany({
      where: { userId, usedAt: null },
      data: { expiresAt: new Date() },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

    const invitation = await this.prisma.invitation.create({
      data: { token, userId, companyId, role, expiresAt },
    });
    return invitation;
  }

  /** トークンに紐づく招待を取得して、画面表示用の情報を返す。 */
  async resolve(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { user: true, company: true },
    });
    if (!invitation) {
      throw new NotFoundException("招待リンクが見つかりません");
    }
    if (invitation.usedAt) {
      throw new BadRequestException("この招待リンクは既に使用されています");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("この招待リンクは有効期限が切れています");
    }
    return {
      email: invitation.user.email,
      name: invitation.user.name,
      companyName: invitation.company.name,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  /**
   * トークンを使ってパスワードを設定し、ログイン用 JWT を返す。
   * - User.passwordHash を設定
   * - CompanyMember.joinedAt を更新
   * - Invitation を消費（usedAt セット）
   */
  async accept(token: string, name: string | undefined, password: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { user: true, company: true },
    });
    if (!invitation) {
      throw new NotFoundException("招待リンクが見つかりません");
    }
    if (invitation.usedAt) {
      throw new BadRequestException("この招待リンクは既に使用されています");
    }
    if (invitation.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException("この招待リンクは有効期限が切れています");
    }

    const passwordHash = hashPassword(password);
    const displayName = name?.trim() || invitation.user.name;

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: invitation.userId },
        data: { passwordHash, name: displayName },
      }),
      this.prisma.companyMember.updateMany({
        where: {
          userId: invitation.userId,
          companyId: invitation.companyId,
        },
        data: { joinedAt: new Date(), isActive: true },
      }),
      this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() },
      }),
    ]);

    const payload = {
      sub: updatedUser.id,
      email: updatedUser.email,
      companyId: invitation.companyId,
      role: invitation.role,
      adminRole: updatedUser.adminRole,
    };
    const jwt = this.jwtService.sign(payload);

    return {
      data: {
        token: jwt,
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
          avatarUrl: updatedUser.avatarUrl,
          companyId: invitation.companyId,
          role: invitation.role,
          adminRole: updatedUser.adminRole,
        },
      },
    };
  }

  /** 既存ユーザーが「未受諾の招待」を持っているかどうか */
  async findActiveByUserId(userId: string) {
    return this.prisma.invitation.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
  }

  /** 招待 URL を組み立てる（フロントのオリジン優先） */
  buildInvitationUrl(token: string, origin: string | undefined): string {
    const base =
      origin ||
      process.env.APP_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    return `${base.replace(/\/$/, "")}/invite/${token}`;
  }
}
