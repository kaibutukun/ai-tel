import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { AdminCallSessionsService } from "./admin-call-sessions.service";

/**
 * GET /api/admin/call-sessions     - 全社の通話セッション一覧
 * GET /api/admin/call-sessions/:id - 通話セッション詳細
 */
@Controller("admin/call-sessions")
@UseGuards(AdminGuard)
export class AdminCallSessionsController {
  constructor(private readonly service: AdminCallSessionsService) {}

  @Get()
  findAll(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("companyId") companyId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.service.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
      companyId: companyId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
