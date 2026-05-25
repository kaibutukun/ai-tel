import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";
import { CreatePhoneNumberDto } from "../../voice/phone-numbers/dto/create-phone-number.dto";
import { AssignPhoneNumberDto } from "./dto/assign-phone-number.dto";
import { UpdatePhoneNumberRequestDto } from "./dto/update-phone-number-request.dto";

@Injectable()
export class AdminPhoneNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /** 運営管理者向け: NTT CPaaS 番号在庫と割当状況を一覧する */
  async findAll() {
    const phoneNumbers = await this.prisma.phoneNumber.findMany({
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
      orderBy: [{ companyId: "asc" }, { createdAt: "desc" }],
    });
    return { data: phoneNumbers, meta: { total: phoneNumbers.length } };
  }

  /**
   * 運営管理者向け: NTT CPaaS で取得済みの番号を在庫登録する。
   * companyId を渡すと登録と同時に会社へ割り当てる。
   */
  async create(dto: CreatePhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({
      where: { number: dto.number },
    });
    if (existing) throw new ConflictException("この電話番号はすでに登録されています");

    await this.assertCompanyAndFlow(dto.companyId, dto.callFlowId);

    const phoneNumber = await this.prisma.phoneNumber.create({
      data: {
        companyId: dto.companyId || null,
        number: dto.number,
        displayName: dto.displayName,
        providerNumberId: dto.providerNumberId,
        provider: "ntt-cpaas",
        transferTo: dto.transferTo,
        isActive: dto.isActive ?? true,
        callFlowId: dto.companyId ? dto.callFlowId : null,
      },
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
    });

    return { data: phoneNumber };
  }

  /** 運営管理者向け: 番号在庫を会社へ割当/未割当へ戻す */
  async assign(id: string, dto: AssignPhoneNumberDto) {
    const existing = await this.prisma.phoneNumber.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("電話番号が見つかりません");

    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: dto.companyId },
        select: { id: true },
      });
      if (!company) throw new NotFoundException("会社が見つかりません");
    }

    const phoneNumber = await this.prisma.phoneNumber.update({
      where: { id },
      data: {
        companyId: dto.companyId || null,
        // 未割当へ戻す場合、会社依存の設定は残さない。
        callFlowId: dto.companyId ? existing.callFlowId : null,
        transferTo: dto.companyId ? existing.transferTo : null,
      },
      include: {
        company: { select: { id: true, name: true } },
        callFlow: { select: { id: true, name: true } },
      },
    });
    return { data: phoneNumber };
  }

  /** 運営管理者向け: 会社からの番号追加リクエスト一覧 */
  async findRequests() {
    const requests = await this.prisma.phoneNumberRequest.findMany({
      include: { company: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return { data: requests, meta: { total: requests.length } };
  }

  /** 運営管理者向け: リクエストの対応状況を更新する */
  async updateRequest(id: string, dto: UpdatePhoneNumberRequestDto) {
    const existing = await this.prisma.phoneNumberRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("リクエストが見つかりません");

    const request = await this.prisma.phoneNumberRequest.update({
      where: { id },
      data: dto,
      include: { company: { select: { id: true, name: true } } },
    });
    return { data: request };
  }

  private async assertCompanyAndFlow(companyId?: string, callFlowId?: string) {
    if (!companyId && callFlowId) {
      throw new BadRequestException("未割当番号には対応フローを設定できません");
    }

    if (!companyId) return;

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) throw new NotFoundException("会社が見つかりません");

    if (!callFlowId) return;

    const callFlow = await this.prisma.callFlow.findFirst({
      where: { id: callFlowId, companyId },
      select: { id: true },
    });
    if (!callFlow) {
      throw new BadRequestException("指定された対応フローが会社に紐づいていません");
    }
  }
}
