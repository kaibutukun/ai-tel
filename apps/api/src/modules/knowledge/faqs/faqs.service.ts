import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { CreateFaqDto } from "./dto/create-faq.dto";
import { UpdateFaqDto } from "./dto/update-faq.dto";
import { BedrockKnowledgeBaseService } from "../infrastructure/bedrock-knowledge-base.service";

@Injectable()
export class FaqsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBase: BedrockKnowledgeBaseService
  ) {}

  /** 会社のFAQ一覧を更新日時順で返す */
  async findAll(companyId: string) {
    const faqs = await this.prisma.fAQ.findMany({
      where: { companyId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
    return { data: faqs, meta: { total: faqs.length } };
  }

  async findOne(id: string) {
    const faq = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!faq) throw new NotFoundException("FAQが見つかりません");
    return { data: faq };
  }

  async create(dto: CreateFaqDto) {
    const faq = await this.prisma.fAQ.create({
      data: {
        companyId: dto.companyId,
        category: dto.category,
        question: dto.question,
        answer: dto.answer,
        isActive: dto.isActive ?? true,
      },
    });

    await this.knowledgeBase.upsertFaq(faq);
    return { data: faq };
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    const faq = await this.prisma.fAQ.update({
      where: { id },
      data: dto,
    });

    await this.knowledgeBase.upsertFaq(faq);
    return { data: faq };
  }

  async remove(id: string) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    await this.prisma.fAQ.delete({ where: { id } });
    await this.knowledgeBase.deleteFaq(id);
    return { data: { message: "FAQを削除しました" } };
  }
}
