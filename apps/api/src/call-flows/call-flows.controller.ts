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
import { CallFlowsService } from "./call-flows.service";
import { CreateCallFlowDto } from "./dto/create-call-flow.dto";
import { UpdateCallFlowDto } from "./dto/update-call-flow.dto";

/**
 * コールフロー管理 API
 *
 * GET    /api/call-flows?companyId=xxx  - 一覧
 * POST   /api/call-flows                - 新規作成（DRAFT）
 * GET    /api/call-flows/:id            - 詳細（flowJson 含む）
 * PATCH  /api/call-flows/:id            - 更新（公開/下書き切替含む）
 * DELETE /api/call-flows/:id            - 削除
 *
 * NOTE: フロー実行ロジック（CPaaS/AI との連携）はコア側が担当
 */
@Controller("call-flows")
export class CallFlowsController {
  constructor(private readonly callFlowsService: CallFlowsService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.callFlowsService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateCallFlowDto) {
    return this.callFlowsService.create(dto);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.callFlowsService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateCallFlowDto) {
    return this.callFlowsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.callFlowsService.remove(id);
  }
}
