import { Controller, Get, Param, Query, BadRequestException } from "@nestjs/common";
import { DocumentsService } from "./documents.service";

/**
 * ドキュメント管理 API（読み取り + アップロードはコア側）
 *
 * GET /api/documents?companyId=xxx  - 一覧
 * GET /api/documents/:id            - 詳細
 */
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.documentsService.findAll(companyId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.documentsService.findOne(id);
  }
}
