import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { AdminGuard } from "../common/guards/admin.guard";

/**
 * プラットフォーム管理 API（User.adminRole === true のみアクセス可）
 *
 * GET   /api/admin/companies        - 全企業一覧 + 統計サマリー
 * GET   /api/admin/companies/:id    - 企業詳細
 * PATCH /api/admin/companies/:id    - 企業情報更新（有効/無効・メモ）
 */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("companies")
  findAllCompanies() {
    return this.adminService.findAllCompanies();
  }

  @Get("companies/:id")
  findCompany(@Param("id") id: string) {
    return this.adminService.findCompany(id);
  }

  @Patch("companies/:id")
  updateCompany(@Param("id") id: string, @Body() dto: UpdateCompanyDto) {
    return this.adminService.updateCompany(id, dto);
  }
}
