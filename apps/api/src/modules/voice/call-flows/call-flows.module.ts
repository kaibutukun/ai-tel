import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { CallFlowsController } from "./call-flows.controller";
import { CallFlowsService } from "./call-flows.service";
import { FlowCompilerService } from "./application/flow-compiler.service";

@Module({
  imports: [DatabaseModule],
  controllers: [CallFlowsController],
  providers: [CallFlowsService, FlowCompilerService],
  exports: [FlowCompilerService],
})
export class CallFlowsModule {}
