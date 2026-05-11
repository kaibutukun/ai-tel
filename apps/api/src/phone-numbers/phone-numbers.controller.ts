import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { PhoneNumbersService } from "./phone-numbers.service";
import { CreatePhoneNumberDto } from "./dto/create-phone-number.dto";
import { UpdatePhoneNumberDto } from "./dto/update-phone-number.dto";

/**
 * 電話番号管理 API
 *
 * GET   /api/phone-numbers?companyId=xxx  - 一覧
 * GET   /api/phone-numbers/:id            - 詳細（営業時間含む）
 * POST  /api/phone-numbers                - Twilio取得済み番号の登録
 * PATCH /api/phone-numbers/:id            - 表示設定更新
 *
 * NOTE: 番号購入・本人確認・Webhook設定は Twilio Console で運営管理者が行う
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

  @Post()
  create(@Body() dto: CreatePhoneNumberDto) {
    return this.phoneNumbersService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePhoneNumberDto) {
    return this.phoneNumbersService.update(id, dto);
  }
}
