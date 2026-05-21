import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { CreateFaqDto } from "./dto/create-faq.dto";
import { UpdateFaqDto } from "./dto/update-faq.dto";
import { BedrockKnowledgeBaseService } from "../infrastructure/bedrock-knowledge-base.service";

@Injectable()
export class FaqsService {
  private readonly logger = new Logger(FaqsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeBase: BedrockKnowledgeBaseService
  ) {}

  // Bedrock 同期失敗で DB 書き込みごと巻き戻すと「DB 保存は成功してるのに 500 が返って
  // 何度作っても失敗扱い」になる。FAQ 自体は登録できたほうがいい (Bedrock 側は後で
  // 再同期できる) ので、ここでは warn だけ出して握りつぶす。
  private async syncToBedrock(
    op: "upsert" | "delete",
    id: string,
    run: () => Promise<void>
  ) {
    try {
      await run();
    } catch (err) {
      this.logger.warn(
        `Bedrock ${op} failed (faqId=${id}): ${(err as Error).message}. ` +
          `DB は保存済み。後で再 sync が必要。`
      );
    }
  }

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

    await this.syncToBedrock("upsert", faq.id, () =>
      this.knowledgeBase.upsertFaq(faq)
    );
    return { data: faq };
  }

  async update(id: string, dto: UpdateFaqDto) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    const faq = await this.prisma.fAQ.update({
      where: { id },
      data: dto,
    });

    await this.syncToBedrock("upsert", faq.id, () =>
      this.knowledgeBase.upsertFaq(faq)
    );
    return { data: faq };
  }

  async remove(id: string) {
    const existing = await this.prisma.fAQ.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("FAQが見つかりません");

    await this.prisma.fAQ.delete({ where: { id } });
    await this.syncToBedrock("delete", id, () =>
      this.knowledgeBase.deleteFaq(id)
    );
    return { data: { message: "FAQを削除しました" } };
  }

  /**
   * DB にあるが Bedrock に未投入の FAQ を一括で再 ingest する。
   * 過去に Bedrock 設定が無い状態で作成した FAQ を救済する用途。
   */
  async resyncAllToBedrock(companyId?: string) {
    const faqs = await this.prisma.fAQ.findMany({
      where: { isActive: true, ...(companyId ? { companyId } : {}) },
    });

    let ok = 0;
    let failed = 0;
    for (const faq of faqs) {
      try {
        await this.knowledgeBase.upsertFaq(faq);
        ok += 1;
      } catch (err) {
        failed += 1;
        this.logger.warn(
          `Resync failed (faqId=${faq.id}): ${(err as Error).message}`
        );
      }
    }
    this.logger.log(`FAQ resync done: ok=${ok} failed=${failed}`);
    return { data: { ok, failed, total: faqs.length } };
  }
}
