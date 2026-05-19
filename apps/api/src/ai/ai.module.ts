import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  controllers: [AiController],
  providers: [AiService],
  // RealtimeModule の ToolExecutorService から AiService を利用するため export
  exports: [AiService],
})
export class AiModule {}
