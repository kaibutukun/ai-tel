import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdatePhoneNumberDto } from "./dto/update-phone-number.dto";

@Injectable()
export class PhoneNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社の電話番号一覧を取得（コールフロー・営業時間を include） */
  async findAll(companyId: string) {
    const phoneNumbers = await this.prisma.phoneNumber.findMany({
      where: { companyId },
      include: {
        callFlow: { select: { id: true, name: true } },
        businessHours: { orderBy: { dayOfWeek: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return { data: phoneNumbers, meta: { total: phoneNumbers.length } };
  }

  async findOne(id: string) {
    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { id },
      include: {
        callFlow: true,
        businessHours: { orderBy: { dayOfWeek: "asc" } },
      },
    });
    if (!phoneNumber) throw new NotFoundException("電話番号が見つかりません");
    return { data: phoneNumber };
  }

  /**
   * 電話番号の表示設定を更新する
   * Twilio 番号の追加・削除はコアロジック（未実装）が担当
   */
  async update(id: string, dto: UpdatePhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("電話番号が見つかりません");

    const phoneNumber = await this.prisma.phoneNumber.update({
      where: { id },
      data: dto,
      include: {
        callFlow: { select: { id: true, name: true } },
        businessHours: { orderBy: { dayOfWeek: "asc" } },
      },
    });
    return { data: phoneNumber };
  }
}
