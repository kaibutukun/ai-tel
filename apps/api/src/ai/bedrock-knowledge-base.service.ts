import { Injectable, Logger } from "@nestjs/common";
import {
  BedrockAgentClient,
  DeleteKnowledgeBaseDocumentsCommand,
  IngestKnowledgeBaseDocumentsCommand,
} from "@aws-sdk/client-bedrock-agent";
import { randomUUID } from "crypto";

interface FaqKnowledgeDocument {
  id: string;
  companyId: string;
  category?: string | null;
  question: string;
  answer: string;
  isActive: boolean;
}

@Injectable()
export class BedrockKnowledgeBaseService {
  private readonly logger = new Logger(BedrockKnowledgeBaseService.name);
  private readonly client = process.env.AWS_REGION
    ? new BedrockAgentClient({ region: process.env.AWS_REGION })
    : null;

  get isConfigured() {
    return Boolean(
      this.client &&
        process.env.BEDROCK_KNOWLEDGE_BASE_ID &&
        process.env.BEDROCK_DATA_SOURCE_ID
    );
  }

  async upsertFaq(faq: FaqKnowledgeDocument) {
    if (!this.isConfigured) return;

    const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID!;
    const dataSourceId = process.env.BEDROCK_DATA_SOURCE_ID!;

    if (!faq.isActive) {
      await this.deleteFaq(faq.id);
      return;
    }

    const text = [
      `種類: FAQ`,
      `カテゴリ: ${faq.category ?? "未分類"}`,
      `質問: ${faq.question}`,
      `回答: ${faq.answer}`,
    ].join("\n");

    await this.client!.send(
      new IngestKnowledgeBaseDocumentsCommand({
        knowledgeBaseId,
        dataSourceId,
        clientToken: randomUUID(),
        documents: [
          {
            content: {
              dataSourceType: "CUSTOM",
              custom: {
                sourceType: "IN_LINE",
                customDocumentIdentifier: { id: this.faqDocumentId(faq.id) },
                inlineContent: {
                  type: "TEXT",
                  textContent: { data: text },
                },
              },
            },
            metadata: {
              type: "IN_LINE_ATTRIBUTE",
              inlineAttributes: [
                { key: "source", value: { type: "STRING", stringValue: "faq" } },
                { key: "companyId", value: { type: "STRING", stringValue: faq.companyId } },
                { key: "faqId", value: { type: "STRING", stringValue: faq.id } },
                {
                  key: "category",
                  value: { type: "STRING", stringValue: faq.category ?? "未分類" },
                },
              ],
            },
          },
        ],
      })
    );
  }

  async deleteFaq(faqId: string) {
    if (!this.isConfigured) return;

    try {
      await this.client!.send(
        new DeleteKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: process.env.BEDROCK_KNOWLEDGE_BASE_ID!,
          dataSourceId: process.env.BEDROCK_DATA_SOURCE_ID!,
          clientToken: randomUUID(),
          documentIdentifiers: [
            {
              dataSourceType: "CUSTOM",
              custom: { id: this.faqDocumentId(faqId) },
            },
          ],
        })
      );
    } catch (error) {
      this.logger.warn(
        `Failed to delete FAQ from Bedrock Knowledge Base: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private faqDocumentId(faqId: string) {
    return `faq-${faqId}`;
  }
}
