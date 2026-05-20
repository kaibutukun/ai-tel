import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CallFlowsModule } from "../call-flows/call-flows.module";
import { AiModule } from "../ai/ai.module";
import { SupervisorModule } from "../supervisor/supervisor.module";
import { RealtimeService } from "./realtime.service";
import { ToolExecutorService } from "./tool-executor.service";

/**
 * RealtimeModule
 *
 * 音声 I/O (CPaaS↔OpenAI Realtime) と Supervisor (脳みそ役) を組み合わせて
 * 通話処理を提供する。WebSocket サーバーは main.ts から
 * RealtimeService.attach(httpServer) で HTTP サーバーに乗せる。
 */
@Module({
  imports: [PrismaModule, CallFlowsModule, AiModule, SupervisorModule],
  providers: [RealtimeService, ToolExecutorService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
