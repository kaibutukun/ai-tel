import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { NttCpaasClient } from "./ntt-cpaas.client";
import { NttCpaasWebhookController } from "./ntt-cpaas-webhook.controller";
import { NttCpaasWebhookService } from "./ntt-cpaas-webhook.service";

/**
 * NTT CPaaS 連携モジュール。
 * Calls API のイベント webhook を受け、通話ログ作成と AI WebSocket endpoint への接続を行う。
 */
@Module({
  imports: [DatabaseModule],
  controllers: [NttCpaasWebhookController],
  providers: [NttCpaasWebhookService, NttCpaasClient],
})
export class NttCpaasModule {}
