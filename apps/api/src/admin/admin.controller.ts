import { Controller, Get, Post, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { CreatePhoneNumberDto } from "../phone-numbers/dto/create-phone-number.dto";
import { AssignPhoneNumberDto } from "./dto/assign-phone-number.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdatePhoneNumberRequestDto } from "./dto/update-phone-number-request.dto";
import { AdminGuard } from "../common/guards/admin.guard";

/**
 * プラットフォーム管理 API（User.adminRole === true のみアクセス可）
 *
 * GET   /api/admin/companies        - 全企業一覧 + 統計サマリー
 * GET   /api/admin/companies/:id    - 企業詳細
 * PATCH /api/admin/companies/:id    - 企業情報更新（有効/無効・メモ）
 * GET   /api/admin/phone-numbers    - NTT CPaaS 番号在庫一覧
 * POST  /api/admin/phone-numbers    - NTT CPaaS 番号を在庫登録
 * PATCH /api/admin/phone-numbers/:id/assignment - 会社へ割当/未割当化
 * GET   /api/admin/phone-number-requests - 会社からの番号追加リクエスト一覧
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

  @Get("phone-numbers")
  findAllPhoneNumbers() {
    return this.adminService.findAllPhoneNumbers();
  }

  @Post("phone-numbers")
  createPhoneNumber(@Body() dto: CreatePhoneNumberDto) {
    return this.adminService.createPhoneNumber(dto);
  }

  @Patch("phone-numbers/:id/assignment")
  assignPhoneNumber(@Param("id") id: string, @Body() dto: AssignPhoneNumberDto) {
    return this.adminService.assignPhoneNumber(id, dto);
  }

  @Get("phone-number-requests")
  findPhoneNumberRequests() {
    return this.adminService.findPhoneNumberRequests();
  }

  @Patch("phone-number-requests/:id")
  updatePhoneNumberRequest(
    @Param("id") id: string,
    @Body() dto: UpdatePhoneNumberRequestDto
  ) {
    return this.adminService.updatePhoneNumberRequest(id, dto);
  }
}
