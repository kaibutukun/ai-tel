import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import {
  AuthenticatedRequest,
  JwtPayload,
} from "../types/authenticated-request";

export type { JwtPayload } from "../types/authenticated-request";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public() デコレータがあればスキップ
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      // 開発環境はトークンなしでも通す
      if (process.env.NODE_ENV !== "production") return true;
      throw new UnauthorizedException("認証トークンが必要です");
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      // リクエストオブジェクトにユーザー情報を付与（後続ハンドラーで参照可能）
      request.user = payload;
    } catch {
      if (process.env.NODE_ENV !== "production") return true;
      throw new UnauthorizedException("無効または期限切れのトークンです");
    }

    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
