import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiService],
  // RealtimeModule の ToolExecutorService から AiService を利用するため export
  exports: [AiService],
})
export class AiModule {}
