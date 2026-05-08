import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { PhoneNumbersService } from "./phone-numbers.service";
import { UpdatePhoneNumberDto } from "./dto/update-phone-number.dto";

/**
 * 電話番号管理 API
 *
 * GET   /api/phone-numbers?companyId=xxx  - 一覧
 * GET   /api/phone-numbers/:id            - 詳細（営業時間含む）
 * PATCH /api/phone-numbers/:id            - 表示設定更新
 *
 * NOTE: 番号のプロビジョニング（追加・削除）は Twilio コア側で行う
 */
@Controller("phone-numbers")
export class PhoneNumbersController {
  constructor(private readonly phoneNumbersService: PhoneNumbersService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.phoneNumbersService.findAll(companyId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.phoneNumbersService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePhoneNumberDto) {
    return this.phoneNumbersService.update(id, dto);
  }
}
