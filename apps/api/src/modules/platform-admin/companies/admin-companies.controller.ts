import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { AdminCompaniesService } from "./admin-companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UpdateCompanyPlanDto } from "./dto/update-company-plan.dto";

/**
 * GET    /api/admin/companies                                  - 全企業一覧 + 統計サマリー
 * POST   /api/admin/companies                                  - 企業 + 初代ADMIN + 招待URL を一括発行
 * GET    /api/admin/companies/:id                              - 企業詳細
 * PATCH  /api/admin/companies/:id                              - 企業情報更新（有効/無効・メモ）
 * PUT    /api/admin/companies/:id/plan                         - 企業ごとのプラン設定を上書き
 * POST   /api/admin/companies/:id/members/:memberId/invitations - 招待リンク再発行
 */
@Controller("admin/companies")
@UseGuards(AdminGuard)
export class AdminCompaniesController {
  constructor(private readonly companiesService: AdminCompaniesService) {}

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateCompanyDto, @Headers("origin") origin?: string) {
    return this.companiesService.create(dto, origin);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Put(":id/plan")
  updatePlan(@Param("id") id: string, @Body() dto: UpdateCompanyPlanDto) {
    return this.companiesService.updatePlan(id, dto);
  }

  @Post(":id/members/:memberId/invitations")
  resendInvitation(
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Headers("origin") origin?: string
  ) {
    return this.companiesService.resendInvitation(id, memberId, origin);
  }
}
