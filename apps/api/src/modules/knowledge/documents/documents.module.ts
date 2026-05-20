import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { KnowledgeInfrastructureModule } from "../infrastructure/knowledge-infrastructure.module";
import { DocumentsController } from "./documents.controller";
import { DocumentsService } from "./documents.service";

@Module({
  imports: [DatabaseModule, KnowledgeInfrastructureModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
