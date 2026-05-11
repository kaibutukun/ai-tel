import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TwilioController } from "./twilio.controller";
import { TwilioService } from "./twilio.service";

/**
 * Twilio 連携モジュール。
 * 番号購入は Twilio Console、着信処理と通話ログ同期はこのモジュールが担当する。
 */
@Module({
  imports: [PrismaModule],
  controllers: [TwilioController],
  providers: [TwilioService],
})
export class TwilioModule {}
