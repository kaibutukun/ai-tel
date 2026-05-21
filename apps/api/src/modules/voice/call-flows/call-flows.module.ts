import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { CallFlowsController } from "./call-flows.controller";
import { CallFlowsService } from "./call-flows.service";
import { FlowRuntimeCompilerService } from "./application/flow-runtime-compiler.service";
import { FlowEngineService } from "./application/flow-engine.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CallFlowsController],
  providers: [CallFlowsService, FlowRuntimeCompilerService, FlowEngineService],
  exports: [FlowRuntimeCompilerService, FlowEngineService],
})
export class CallFlowsModule {}
