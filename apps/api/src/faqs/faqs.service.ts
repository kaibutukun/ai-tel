import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateFaqDto } from "./dto/create-faq.dto";
import { UpdateFaqDto } from "./dto/update-faq.dto";

@Injectable()
export class FaqsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社のFAQ一覧を priority 昇順で返す */
  async findAll(companyId: string) {
    const faqs = await this.prisma.fAQ.findMany({
      where: { companyId },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
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
        priority: dto.priority ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
    return { data: faq };
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    const faq = await this.prisma.fAQ.update({
      where: { id },
      data: dto,
    });
    return { data: faq };
  }

  async remove(id: string) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    await this.prisma.fAQ.delete({ where: { id } });
    return { data: { message: "FAQを削除しました" } };
  }
}
