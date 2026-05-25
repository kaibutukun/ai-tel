import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { CallSessionsService } from "./call-sessions.service";

/**
 * 通話セッション API（読み取り専用）
 * 通話データは CPaaS/AI コアロジックによって書き込まれる
 *
 * GET /api/call-sessions?companyId=xxx&page=1&limit=20&callFlowId=...&from=...&to=...  - 一覧
 * GET /api/call-sessions/:id                            - 詳細
 */
@Controller("call-sessions")
export class CallSessionsController {
  constructor(private readonly callSessionsService: CallSessionsService) {}

  @Get()
  findAll(
    @Query("companyId") companyId: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("callFlowId") callFlowId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.callSessionsService.findAll(companyId, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      callFlowId: callFlowId || undefined,
      from: from || undefined,
      to: to || undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.callSessionsService.findOne(id);
  }
}
