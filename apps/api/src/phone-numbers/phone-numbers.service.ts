import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePhoneNumberDto } from "./dto/create-phone-number.dto";
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
   * Twilio Console で取得済みの番号を会社に紐づける。
   * 番号購入・Webhook設定は運営管理者が Twilio 側で行い、アプリは利用設定だけを持つ。
   */
  async create(dto: CreatePhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({
      where: { number: dto.number },
    });
    if (existing) throw new ConflictException("この電話番号はすでに登録されています");

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException("会社が見つかりません");

    if (dto.callFlowId) {
      const callFlow = await this.prisma.callFlow.findFirst({
        where: { id: dto.callFlowId, companyId: dto.companyId },
        select: { id: true },
      });
      if (!callFlow) {
        throw new BadRequestException("指定された対応フローが会社に紐づいていません");
      }
    }

    const phoneNumber = await this.prisma.phoneNumber.create({
      data: {
        companyId: dto.companyId,
        number: dto.number,
        displayName: dto.displayName,
        twilioSid: dto.twilioSid,
        transferTo: dto.transferTo,
        isActive: dto.isActive ?? true,
        callFlowId: dto.callFlowId,
      },
      include: {
        callFlow: { select: { id: true, name: true } },
        businessHours: { orderBy: { dayOfWeek: "asc" } },
      },
    });

    return { data: phoneNumber };
  }

  /**
   * 電話番号の表示設定を更新する
   * Twilio Console 側の番号そのものは変更せず、アプリ内の利用設定だけを更新する
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
