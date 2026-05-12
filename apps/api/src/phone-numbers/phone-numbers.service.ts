import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePhoneNumberRequestDto } from "./dto/create-phone-number-request.dto";
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

  /** 会社ユーザーが運営管理者へ電話番号追加を依頼する */
  async createRequest(dto: CreatePhoneNumberRequestDto) {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException("会社が見つかりません");

    const request = await this.prisma.phoneNumberRequest.create({
      data: {
        companyId: dto.companyId,
        note: dto.note,
      },
      include: { company: { select: { id: true, name: true } } },
    });

    return { data: request };
  }

  /**
   * 電話番号の表示設定を更新する
   * NTT CPaaS 側の番号そのものは変更せず、アプリ内の利用設定だけを更新する
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
