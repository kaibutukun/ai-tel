import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { MembersService } from "./members.service";
import { CreateMemberDto } from "./dto/create-member.dto";
import { UpdateMemberRoleDto } from "./dto/update-member-role.dto";

/**
 * メンバー管理 API
 *
 * TODO: auth 実装後は companyId をクエリパラメータではなく JWT から取得する
 *
 * GET    /api/members?companyId=xxx    - メンバー一覧
 * POST   /api/members                 - メンバー招待
 * PATCH  /api/members/:id/role        - ロール変更
 * DELETE /api/members/:id             - メンバー削除
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
  invite(@Body() dto: CreateMemberDto) {
    return this.membersService.invite(dto);
  }

  @Patch(":id/role")
  updateRole(
    @Param("id") id: string,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.membersService.updateRole(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.membersService.remove(id);
  }
}
