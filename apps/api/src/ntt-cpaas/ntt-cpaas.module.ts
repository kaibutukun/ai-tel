import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NttCpaasController } from "./ntt-cpaas.controller";
import { NttCpaasService } from "./ntt-cpaas.service";

/**
 * NTT CPaaS 連携モジュール。
 * Calls API のイベント webhook を受け、通話ログ作成と AI WebSocket endpoint への接続を行う。
 */
@Module({
  imports: [PrismaModule],
  controllers: [NttCpaasController],
  providers: [NttCpaasService],
})
export class NttCpaasModule {}
