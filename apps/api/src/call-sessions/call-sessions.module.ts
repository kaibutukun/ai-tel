import { Module } from "@nestjs/common";
import { CallSessionsController } from "./call-sessions.controller";
import { CallSessionsService } from "./call-sessions.service";

@Module({
  controllers: [CallSessionsController],
  providers: [CallSessionsService],
})
export class CallSessionsModule {}
