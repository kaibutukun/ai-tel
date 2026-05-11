import { Module } from "@nestjs/common";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";
import { BedrockKnowledgeBaseService } from "../ai/bedrock-knowledge-base.service";

@Module({
  controllers: [DocumentsController],
  providers: [DocumentsService, BedrockKnowledgeBaseService],
})
export class DocumentsModule {}
