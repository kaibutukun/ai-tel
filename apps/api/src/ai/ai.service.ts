import { Injectable } from "@nestjs/common";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { AnswerQuestionDto } from "./dto/answer-question.dto";

// ─────────────────────────────────────────────────────────────
// AiService
//
// 知識源は AWS Bedrock Knowledge Base 一本に統一。
//
// 流れ:
//   1. クエリ → Bedrock RetrieveCommand で vector 検索
//   2. minScore 未満の結果は捨てる（ノードの "正確さ" パラメータで制御）
//   3. 残った sources を context として OpenAI に渡し、最終回答文を生成
// ─────────────────────────────────────────────────────────────

interface KnowledgeSource {
  type: "BEDROCK";
  id?: string;
  source?: "faq" | "document" | string;
  faqId?: string;
  documentId?: string;
  category?: string;
  title: string;
  content: string;
  score?: number;
}

const DEFAULT_MIN_SCORE = 0.7;

@Injectable()
export class AiService {
  private readonly bedrockClient =
    process.env.AWS_REGION && process.env.BEDROCK_KNOWLEDGE_BASE_ID
      ? new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION })
      : null;

  constructor() {}

  async answer(dto: AnswerQuestionDto) {
    const question = dto.question.trim();
    const minScore = dto.minScore ?? DEFAULT_MIN_SCORE;

    // Bedrock は最大10件取りに行き、minScore でフィルタする
    const all = await this.retrieveFromBedrock(question, 10);
    const sources = all
      .filter((s) => (s.score ?? 0) >= minScore)
      .slice(0, 8);

    const answer = await this.generateAnswer(question, sources);

    return {
      data: {
        answer,
        sources: sources.map((source) => ({
          type: source.type,
          id: source.id,
          source: source.source,
          faqId: source.faqId,
          documentId: source.documentId,
          category: source.category,
          title: source.title,
          score: source.score,
          excerpt: source.content.slice(0, 240),
        })),
      },
    };
  }

  /**
   * Bedrock Knowledge Base から類似度の高い chunks を取得する。
   * Bedrock 側で「クエリのエンベディング → 内蔵 vector DB で類似検索」を行うため、
   * こちらのアプリ側でのエンベディング処理は不要。
   */
  private async retrieveFromBedrock(question: string, numResults = 10): Promise<KnowledgeSource[]> {
    const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID;
    if (!this.bedrockClient || !knowledgeBaseId) return [];

    try {
      const response = await this.bedrockClient.send(
        new RetrieveCommand({
          knowledgeBaseId,
          retrievalQuery: { text: question },
          retrievalConfiguration: {
            vectorSearchConfiguration: { numberOfResults: numResults },
          },
        })
      );

      return (response.retrievalResults ?? [])
        .map<KnowledgeSource | null>((result, index) => {
          const text = result.content?.text?.trim();
          if (!text) return null;

          // FAQ を Bedrock に入れている場合、answer / category / faqId がメタデータに入る
          const meta = result.metadata as Record<string, unknown> | undefined;
          const source = this.readMetaString(meta?.["source"]);
          const answer = this.readMetaString(meta?.["answer"]);
          const category = this.readMetaString(meta?.["category"]);
          const faqId = this.readMetaString(meta?.["faqId"]);
          const documentId = this.readMetaString(meta?.["documentId"]);
          const content = answer ? `質問: ${text}\n回答: ${answer}` : text;
          const title = category ? `FAQ（${category}）` : `参考資料 ${index + 1}`;

          return {
            type: "BEDROCK",
            id: faqId ?? documentId,
            source,
            faqId,
            documentId,
            category,
            title,
            content,
            score: result.score,
          };
        })
        .filter((source): source is KnowledgeSource => source !== null);
    } catch {
      return [];
    }
  }

  /** 取得した sources を OpenAI に渡して短い自然な回答文を作る */
  private async generateAnswer(question: string, sources: KnowledgeSource[]) {
    if (sources.length === 0) {
      return "関連する情報が見つかりませんでした。登録済みの参考資料を確認してください。";
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return this.contextOnlyAnswer(sources);

    const context = sources
      .map((source, index) => `[${index + 1}] ${source.title}\n${source.content}`)
      .join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "あなたは電話自動応答AIです。与えられた参考資料の範囲だけで、短く自然な日本語で回答してください。不明な場合は不明と伝え、推測しないでください。",
            },
            {
              role: "user",
              content: `質問:\n${question}\n\n参照情報:\n${context}`,
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`OpenAI API error: ${response.status}`);
      const body = (await response.json()) as {
        choices?: { message?: { content?: string } }[];
      };

      return body.choices?.[0]?.message?.content?.trim() || this.contextOnlyAnswer(sources);
    } catch {
      return this.contextOnlyAnswer(sources);
    }
  }

  /** OpenAI が使えない場合のフォールバック: 最も類似度の高い source をそのまま返す */
  private contextOnlyAnswer(sources: KnowledgeSource[]) {
    const top = sources[0];
    return top.content.length > 600 ? `${top.content.slice(0, 600)}...` : top.content;
  }

  private readMetaString(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (!value || typeof value !== "object") return undefined;

    const record = value as Record<string, unknown>;
    const candidate = record.stringValue ?? record.value;
    return typeof candidate === "string" ? candidate : undefined;
  }
}
