import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { DocumentStatus, DocumentType } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { BedrockKnowledgeBaseService } from "../infrastructure/bedrock-knowledge-base.service";
import { CreateDocumentDto } from "./dto/create-document.dto";
import { UpdateDocumentDto } from "./dto/update-document.dto";

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 160;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bedrock: BedrockKnowledgeBaseService,
  ) {}

  /** 会社のドキュメント一覧を返す */
  async findAll(companyId: string) {
    const documents = await this.prisma.document.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
    });
    return { data: documents, meta: { total: documents.length } };
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { chunks: { orderBy: { chunkIndex: "asc" } } },
    });
    if (!doc) throw new NotFoundException("ドキュメントが見つかりません");
    return { data: doc };
  }

  async create(dto: CreateDocumentDto) {
    this.validatePayload(dto.type, dto.url, dto.content);

    const prepared = await this.prepareContent(dto.type, dto.url, dto.content);

    const doc = await this.prisma.document.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        type: dto.type,
        url: dto.url,
        content: prepared.content,
        status: prepared.status,
        chunks: {
          create: prepared.chunks.map((content, chunkIndex) => ({
            content,
            chunkIndex,
          })),
        },
      },
    });

    return { data: doc };
  }

  async uploadPdf(companyId: string, file: Express.Multer.File, name?: string) {
    if (!companyId) throw new BadRequestException("companyId is required");
    if (!file) throw new BadRequestException("PDFファイルが必要です");

    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new BadRequestException("PDFファイルのみアップロードできます");

    // レコードを先に作成して ID を確定する
    const doc = await this.prisma.document.create({
      data: {
        companyId,
        name: name?.trim() || file.originalname,
        type: DocumentType.PDF,
        status: DocumentStatus.AVAILABLE,
      },
    });

    // S3 にアップロードして URL を保存（RAG 対象外のためテキスト抽出は行わない）
    const s3Uri = await this.bedrock.uploadPdfToS3(doc.id, companyId, file.buffer);
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: { url: s3Uri },
    });

    return { data: updated };
  }

  async update(id: string, dto: UpdateDocumentDto) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("ドキュメントが見つかりません");

    const type = dto.type ?? existing.type;
    const url = dto.url ?? existing.url ?? undefined;
    const content = dto.content ?? existing.content ?? undefined;
    this.validatePayload(type, url, content);

    const shouldRechunk =
      dto.type !== undefined || dto.url !== undefined || dto.content !== undefined;
    const prepared = shouldRechunk
      ? await this.prepareContent(type, url, content)
      : null;

    const doc = await this.prisma.$transaction(async (tx) => {
      if (prepared) {
        await tx.documentChunk.deleteMany({ where: { documentId: id } });
      }

      return tx.document.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          url: dto.url,
          content: prepared?.content,
          status: prepared?.status,
          chunks: prepared
            ? {
                create: prepared.chunks.map((chunkContent, chunkIndex) => ({
                  content: chunkContent,
                  chunkIndex,
                })),
              }
            : undefined,
        },
      });
    });

    return { data: doc };
  }

  async remove(id: string) {
    const existing = await this.prisma.document.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("ドキュメントが見つかりません");

    // DB から削除し、PDF の場合は S3 からも削除する
    await this.prisma.document.delete({ where: { id } });
    if (existing.type === DocumentType.PDF) {
      await this.bedrock.deletePdfFromS3(id, existing.companyId);
    }

    return { data: { message: "ドキュメントを削除しました" } };
  }

  private validatePayload(type: DocumentType, url?: string, content?: string) {
    if (type === DocumentType.URL && !url) {
      throw new BadRequestException("URL資料にはurlが必要です");
    }

    if (type === DocumentType.TEXT && !content?.trim()) {
      throw new BadRequestException("テキスト資料にはcontentが必要です");
    }
  }

  private async prepareContent(type: DocumentType, url?: string, content?: string) {
    let body = content?.trim() ?? "";
    let status: DocumentStatus = DocumentStatus.AVAILABLE;

    if (type === DocumentType.URL && url && !body) {
      try {
        body = await this.fetchUrlText(url);
      } catch {
        status = DocumentStatus.ERROR;
      }
    }

    // PDF は uploadPdf() 側で処理するためここでは何もしない
    if (type === DocumentType.PDF && !body) {
      status = DocumentStatus.ERROR;
    }

    return {
      content: body || null,
      status,
      chunks: body ? this.chunkText(body) : [],
    };
  }

  private async fetchUrlText(url: string) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "ai-tel-document-fetcher/1.0" },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status}`);
      }

      const html = await response.text();
      return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
    } finally {
      clearTimeout(timeout);
    }
  }

  private chunkText(text: string) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const chunks: string[] = [];
    let start = 0;

    while (start < normalized.length) {
      const end = Math.min(start + CHUNK_SIZE, normalized.length);
      chunks.push(normalized.slice(start, end));
      if (end === normalized.length) break;
      start = Math.max(0, end - CHUNK_OVERLAP);
    }

    return chunks;
  }
}
