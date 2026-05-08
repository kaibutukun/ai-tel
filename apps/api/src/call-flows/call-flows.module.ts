import { Module } from "@nestjs/common";
import { CallFlowsController } from "./call-flows.controller";
import { CallFlowsService } from "./call-flows.service";

@Module({
  controllers: [CallFlowsController],
  providers: [CallFlowsService],
})
export class CallFlowsModule {}
