import { Injectable, NotFoundException } from "@nestjs/common";
import { FlowStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { CreateCallFlowDto } from "./dto/create-call-flow.dto";
import { UpdateCallFlowDto } from "./dto/update-call-flow.dto";

@Injectable()
export class CallFlowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 会社のコールフロー一覧（flowJson は一覧では返さず軽量化） */
  async findAll(companyId: string) {
    const flows = await this.prisma.callFlow.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        updatedAt: true,
        // 関連する電話番号数をカウント
        _count: { select: { phoneNumbers: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return { data: flows, meta: { total: flows.length } };
  }

  /** コールフロー詳細（flowJson を含む） */
  async findOne(id: string) {
    const flow = await this.prisma.callFlow.findUnique({
      where: { id },
      include: {
        phoneNumbers: { select: { id: true, number: true, displayName: true } },
      },
    });
    if (!flow) throw new NotFoundException("コールフローが見つかりません");
    return { data: flow };
  }

  /** コールフローを新規作成（DRAFT で開始） */
  async create(dto: CreateCallFlowDto) {
    const flow = await this.prisma.callFlow.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        status: FlowStatus.DRAFT,
        flowJson: dto.flowJson ?? null,
      },
    });
    return { data: flow };
  }

  async update(id: string, dto: UpdateCallFlowDto) {
    const existing = await this.prisma.callFlow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("コールフローが見つかりません");

    const flow = await this.prisma.callFlow.update({
      where: { id },
      data: dto,
    });
    return { data: flow };
  }

  async remove(id: string) {
    const existing = await this.prisma.callFlow.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("コールフローが見つかりません");

    await this.prisma.callFlow.delete({ where: { id } });
    return { data: { message: "コールフローを削除しました" } };
  }
}
