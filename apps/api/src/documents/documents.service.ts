import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社のドキュメント一覧を返す */
  async findAll(companyId: string) {
    const documents = await this.prisma.document.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
    });
    return { data: documents, meta: { total: documents.length } };
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException("ドキュメントが見つかりません");
    return { data: doc };
  }
}
