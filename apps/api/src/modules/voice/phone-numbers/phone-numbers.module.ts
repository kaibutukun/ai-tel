import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { PhoneNumbersController } from "./phone-numbers.controller";
import { PhoneNumbersService } from "./phone-numbers.service";

@Module({
  imports: [DatabaseModule],
  controllers: [PhoneNumbersController],
  providers: [PhoneNumbersService],
})
export class PhoneNumbersModule {}
