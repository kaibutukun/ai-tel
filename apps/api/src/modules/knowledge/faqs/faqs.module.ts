import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { KnowledgeInfrastructureModule } from "../infrastructure/knowledge-infrastructure.module";
import { FaqsController } from "./faqs.controller";
import { FaqsService } from "./faqs.service";

@Module({
  imports: [DatabaseModule, KnowledgeInfrastructureModule],
  controllers: [FaqsController],
  providers: [FaqsService],
})
export class FaqsModule {}
