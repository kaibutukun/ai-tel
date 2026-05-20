import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { DocumentsService } from "./documents.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";

/**
 * ドキュメント管理 API
 *
 * GET /api/documents?companyId=xxx  - 一覧
 * POST /api/documents                - 新規作成
 * GET /api/documents/:id            - 詳細
 * PATCH /api/documents/:id          - 更新
 * DELETE /api/documents/:id         - 削除
 */
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll(@Query("companyId") companyId: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    return this.documentsService.findAll(companyId);
  }

  @Post()
  create(@Body() dto: CreateDocumentDto) {
    return this.documentsService.create(dto);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 },
    })
  )
  uploadPdf(
    @UploadedFile() file: Express.Multer.File,
    @Body("companyId") companyId: string,
    @Body("name") name?: string
  ) {
    return this.documentsService.uploadPdf(companyId, file, name);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.documentsService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateDocumentDto) {
    return this.documentsService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.documentsService.remove(id);
  }
}
