import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CallFlowsModule } from "../call-flows/call-flows.module";
import { AiModule } from "../ai/ai.module";
import { RealtimeService } from "./realtime.service";
import { ToolExecutorService } from "./tool-executor.service";

/**
 * RealtimeModule
 *
 * NTT CPaaS WebSocket endpoint ↔ OpenAI Realtime API のブリッジを提供する。
 * WebSocket サーバーは main.ts から RealtimeService.attach(httpServer) で
 * HTTP サーバーに乗せる。
 */
@Module({
  imports: [PrismaModule, CallFlowsModule, AiModule],
  providers: [RealtimeService, ToolExecutorService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
