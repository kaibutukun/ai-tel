import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

/** パスワードを "salt:hash" 形式でハッシュ化する（Node.js 組み込み scrypt） */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/** 入力パスワードと保存済みハッシュを照合する */
function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = scryptSync(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(hash, "hex"));
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  /** メールアドレス＋パスワードでログインし JWT を返す */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      // 存在しないユーザーでも同じエラーを返す（ユーザー名列挙攻撃対策）
      throw new UnauthorizedException(
        "メールアドレスまたはパスワードが間違っています"
      );
    }

    const valid = verifyPassword(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(
        "メールアドレスまたはパスワードが間違っています"
      );
    }

    // 所属する会社の情報をJWTペイロードに含める（最初の有効メンバーシップを使用）
    const membership = await this.prisma.companyMember.findFirst({
      where: { userId: user.id, isActive: true },
      orderBy: { joinedAt: "asc" },
    });

    const payload = {
      sub: user.id,
      email: user.email,
      companyId: membership?.companyId ?? null,
      role: membership?.role ?? null,
      adminRole: user.adminRole,
    };

    const token = this.jwtService.sign(payload);

    return {
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          companyId: membership?.companyId ?? null,
          role: membership?.role ?? null,
          adminRole: user.adminRole,
        },
      },
    };
  }
}
