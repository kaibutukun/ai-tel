import { Controller, Get, Query, BadRequestException } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";

/**
 * ダッシュボード API
 * GET /api/dashboard?companyId=xxx  - 今日の統計 + 週間推移
 */
@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getStats(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.dashboardService.getStats(companyId);
  }
}
