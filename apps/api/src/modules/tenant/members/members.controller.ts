import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
} from "@nestjs/common";
import { MembersService } from "./members.service";
import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import { JwtPayload } from "../../../common/types/authenticated-request";

/**
 * メンバー管理 API
 *
 * GET    /api/members?companyId=xxx           - メンバー一覧
 * POST   /api/members                         - メンバー招待（招待URLを返す）※ADMIN のみ
 * PATCH  /api/members/:id/role                - ロール変更 ※ADMIN のみ
 * DELETE /api/members/:id                     - メンバー削除 ※ADMIN のみ・自分自身は不可
 * POST   /api/members/:id/invitations         - 招待リンク再発行 ※ADMIN のみ
 */
@Controller("members")
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) {
      throw new BadRequestException("companyId is required");
    }
    return this.membersService.findAll(companyId);
  }

  @Post()
  invite(
    @Body() dto: CreateMemberDto,
    @CurrentUser() user: JwtPayload,
    @Headers("origin") origin?: string
  ) {
    return this.membersService.invite(dto, user, origin);
  }

  @Patch(":id/role")
  updateRole(
    @Param("id") id: string,
    @Body() dto: UpdateMemberRoleDto,
    @CurrentUser() user: JwtPayload
  ) {
    return this.membersService.updateRole(id, dto, user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.membersService.remove(id, user);
  }

  @Post(":id/invitations")
  resendInvitation(
    @Param("id") id: string,
    @CurrentUser() user: JwtPayload,
    @Headers("origin") origin?: string
  ) {
    return this.membersService.resendInvitation(id, user, origin);
  }
}
