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
import { FaqsService } from "./faqs.service";
import { CreateFaqDto } from "./dto/create-faq.dto";
import { UpdateFaqDto } from "./dto/update-faq.dto";

/**
 * FAQ 管理 API
 *
 * GET    /api/faqs?companyId=xxx  - 一覧
 * POST   /api/faqs                - 新規作成
 * GET    /api/faqs/:id            - 詳細
 * PATCH  /api/faqs/:id            - 更新
 * DELETE /api/faqs/:id            - 削除
 */
@Controller("faqs")
export class FaqsController {
  constructor(private readonly faqsService: FaqsService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.faqsService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateFaqDto) {
    return this.faqsService.create(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.faqsService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFaqDto) {
    return this.faqsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.faqsService.remove(id);
  }
}
