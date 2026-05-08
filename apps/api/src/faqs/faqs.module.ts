import { Module } from "@nestjs/common";
import { BedrockKnowledgeBaseService } from "../ai/bedrock-knowledge-base.service";
import { FaqsController } from "./faqs.controller";
import { FaqsService } from "./faqs.service";

@Module({
  controllers: [FaqsController],
  providers: [FaqsService, BedrockKnowledgeBaseService],
})
export class FaqsModule {}
