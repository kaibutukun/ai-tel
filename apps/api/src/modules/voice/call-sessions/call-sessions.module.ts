import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { CallSessionsController } from "./call-sessions.controller";
import { CallSessionsService } from "./call-sessions.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CallSessionsController],
  providers: [CallSessionsService],
})
export class CallSessionsModule {}
