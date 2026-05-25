import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { CreatePhoneNumberDto } from "../../voice/phone-numbers/dto/create-phone-number.dto";
import { AdminPhoneNumbersService } from "./admin-phone-numbers.service";
import { AssignPhoneNumberDto } from "./dto/assign-phone-number.dto";
import { UpdatePhoneNumberRequestDto } from "./dto/update-phone-number-request.dto";

/**
 * GET   /api/admin/phone-numbers    - NTT CPaaS 番号在庫一覧
 * POST  /api/admin/phone-numbers    - NTT CPaaS 番号を在庫登録
 * PATCH /api/admin/phone-numbers/:id/assignment - 会社へ割当/未割当化
 * GET   /api/admin/phone-number-requests        - 会社からの番号追加リクエスト一覧
 * PATCH /api/admin/phone-number-requests/:id    - リクエストの対応状況を更新
 */
@Controller("admin")
@UseGuards(AdminGuard)
export class AdminPhoneNumbersController {
  constructor(private readonly service: AdminPhoneNumbersService) {}

  @Get("phone-numbers")
  findAll() {
    return this.service.findAll();
  }

  @Post("phone-numbers")
  create(@Body() dto: CreatePhoneNumberDto) {
    return this.service.create(dto);
  }

  @Patch("phone-numbers/:id/assignment")
  assign(@Param("id") id: string, @Body() dto: AssignPhoneNumberDto) {
    return this.service.assign(id, dto);
  }

  @Get("phone-number-requests")
  findRequests() {
    return this.service.findRequests();
  }

  @Patch("phone-number-requests/:id")
  updateRequest(
    @Param("id") id: string,
    @Body() dto: UpdatePhoneNumberRequestDto
  ) {
    return this.service.updateRequest(id, dto);
  }
}
