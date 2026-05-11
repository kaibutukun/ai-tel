import { Injectable, Logger } from "@nestjs/common";
import {
  BedrockAgentClient,
  DeleteKnowledgeBaseDocumentsCommand,
  IngestKnowledgeBaseDocumentsCommand,
  StartIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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
  private readonly s3 = process.env.AWS_REGION
    ? new S3Client({ region: process.env.AWS_REGION })
    : null;

  // Bedrock への取り込みに必要な設定が揃っているか
  get isConfigured() {
    return Boolean(
      this.client &&
        process.env.BEDROCK_KNOWLEDGE_BASE_ID &&
        process.env.BEDROCK_DATA_SOURCE_ID
    );
  }

  // S3 へのアップロードに必要な設定が揃っているか
  get isS3Configured() {
    return Boolean(this.s3 && process.env.AWS_S3_BUCKET);
  }

  /** PDF ファイルを S3 にアップロードして S3 URI を返す */
  async uploadPdfToS3(docId: string, companyId: string, buffer: Buffer): Promise<string> {
    if (!this.isS3Configured) {
      throw new Error("S3が未設定です。AWS_S3_BUCKETを環境変数に追加してください。");
    }

    const bucket = process.env.AWS_S3_BUCKET!;
    const key = `documents/${companyId}/${docId}.pdf`;

    await this.s3!.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: "application/pdf",
      })
    );

    return `s3://${bucket}/${key}`;
  }

  /** S3 の PDF を削除する */
  async deletePdfFromS3(docId: string, companyId: string) {
    if (!this.isS3Configured) return;

    try {
      await this.s3!.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET!,
          Key: `documents/${companyId}/${docId}.pdf`,
        })
      );
    } catch (error) {
      this.logger.warn(`S3削除失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * S3 データソースの同期ジョブを起動する。
   * PDFを S3 にアップ後にこれを呼ぶと Bedrock が差分を検知してインデックスを更新する。
   * BEDROCK_DATA_SOURCE_ID = AWS コンソールの Knowledge Base > データソース で確認できる ID。
   */
  async triggerS3Sync() {
    if (!this.isConfigured) return;

    try {
      await this.client!.send(
        new StartIngestionJobCommand({
          knowledgeBaseId: process.env.BEDROCK_KNOWLEDGE_BASE_ID!,
          dataSourceId: process.env.BEDROCK_DATA_SOURCE_ID!,
        })
      );
    } catch (error) {
      // 既に同期ジョブが実行中の場合など、致命的でないエラーはログだけ出す
      this.logger.warn(`Bedrock sync失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Bedrock Knowledge Base から PDF ドキュメントを削除する（CUSTOM データソース用） */
  async deletePdfDocument(docId: string) {
    if (!this.isConfigured) return;

    try {
      await this.client!.send(
        new DeleteKnowledgeBaseDocumentsCommand({
          knowledgeBaseId: process.env.BEDROCK_KNOWLEDGE_BASE_ID!,
          dataSourceId: process.env.BEDROCK_DATA_SOURCE_ID!,
          clientToken: randomUUID(),
          documentIdentifiers: [
            { dataSourceType: "CUSTOM", custom: { id: `pdf-${docId}` } },
          ],
        })
      );
    } catch (error) {
      this.logger.warn(`Bedrock PDF削除失敗: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async upsertFaq(faq: FaqKnowledgeDocument) {
    if (!this.isConfigured) return;

    const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID!;
    const dataSourceId = process.env.BEDROCK_DATA_SOURCE_ID!;

    if (!faq.isActive) {
      await this.deleteFaq(faq.id);
      return;
    }

    // 質問文だけをベクトル化することで、ユーザー質問との意味的な類似度が上がる
    // 回答はメタデータに持たせ、ヒット時に取り出して AI に渡す
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
                  textContent: { data: faq.question },
                },
              },
            },
            metadata: {
              type: "IN_LINE_ATTRIBUTE",
              inlineAttributes: [
                { key: "source", value: { type: "STRING", stringValue: "faq" } },
                { key: "companyId", value: { type: "STRING", stringValue: faq.companyId } },
                { key: "faqId", value: { type: "STRING", stringValue: faq.id } },
                { key: "category", value: { type: "STRING", stringValue: faq.category ?? "未分類" } },
                { key: "answer", value: { type: "STRING", stringValue: faq.answer } },
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
