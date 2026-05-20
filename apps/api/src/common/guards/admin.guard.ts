import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { AuthenticatedRequest } from "../types/authenticated-request";

/**
 * User.adminRole === true のユーザーだけを通すガード。
 * JwtAuthGuard（APP_GUARD）が先に実行されて request["user"] をセットしている前提。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.adminRole) {
      throw new ForbiddenException("この操作にはプラットフォーム管理者権限が必要です");
    }
    return true;
  }
}
