import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Request } from "express";
import { JwtPayload } from "./jwt-auth.guard";

/**
 * User.adminRole === true のユーザーだけを通すガード。
 * JwtAuthGuard（APP_GUARD）が先に実行されて request["user"] をセットしている前提。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request["user"] as JwtPayload | undefined;

    if (!user?.adminRole) {
      throw new ForbiddenException("この操作にはプラットフォーム管理者権限が必要です");
    }
    return true;
  }
}
