import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Public } from "../../../common/decorators/public.decorator";
import { InvitationsService } from "./invitations.service";
import { AcceptInvitationDto } from "./dto/accept-invitation.dto";

/**
 * 招待トークン関連 API（認証不要）
 *
 * GET  /api/invitations/:token         - トークン検証 + 表示用情報
 * POST /api/invitations/:token/accept  - パスワード設定 → JWT 発行で自動ログイン
 */
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Public()
  @Get(":token")
  resolve(@Param("token") token: string) {
    return this.invitations.resolve(token).then((data) => ({ data }));
  }

  @Public()
  @Post(":token/accept")
  accept(@Param("token") token: string, @Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(token, dto.name, dto.password);
  }
}
