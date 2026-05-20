import { Module } from "@nestjs/common";
import { BedrockKnowledgeBaseService } from "./bedrock-knowledge-base.service";

@Module({
  providers: [BedrockKnowledgeBaseService],
  exports: [BedrockKnowledgeBaseService],
})
export class KnowledgeInfrastructureModule {}
