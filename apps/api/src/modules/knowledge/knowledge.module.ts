import { Module } from "@nestjs/common";
import { AiModule } from "./ai-answering/ai.module";
import { DocumentsModule } from "./documents/documents.module";
import { FaqsModule } from "./faqs/faqs.module";

@Module({
  imports: [FaqsModule, DocumentsModule, AiModule],
  exports: [AiModule],
})
export class KnowledgeModule {}
