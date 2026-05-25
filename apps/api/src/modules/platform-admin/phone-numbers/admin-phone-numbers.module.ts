import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { AdminPhoneNumbersController } from "./admin-phone-numbers.controller";
import { AdminPhoneNumbersService } from "./admin-phone-numbers.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminPhoneNumbersController],
  providers: [AdminPhoneNumbersService],
})
export class AdminPhoneNumbersModule {}
