import { Module } from "@nestjs/common";
import { CallFlowsController } from "./call-flows.controller";
import { CallFlowsService } from "./call-flows.service";
import { FlowCompilerService } from "./flow-compiler.service";

@Module({
  controllers: [CallFlowsController],
  providers: [CallFlowsService, FlowCompilerService],
  // RealtimeModule から FlowCompilerService を利用するため export する
  exports: [FlowCompilerService],
})
export class CallFlowsModule {}
