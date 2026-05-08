import { Injectable } from "@nestjs/common";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { PrismaService } from "../prisma/prisma.service";
import { AnswerQuestionDto } from "./dto/answer-question.dto";

interface KnowledgeSource {
  type: "FAQ" | "DOCUMENT" | "BEDROCK";
  id?: string;
  title: string;
  content: string;
  score?: number;
}

@Injectable()
export class AiService {
  private readonly bedrockClient =
    process.env.AWS_REGION && process.env.BEDROCK_KNOWLEDGE_BASE_ID
      ? new BedrockAgentRuntimeClient({ region: process.env.AWS_REGION })
      : null;

  constructor(private readonly prisma: PrismaService) {}

  async answer(dto: AnswerQuestionDto) {
    const question = dto.question.trim();
    const [localSources, bedrockSources] = await Promise.all([
      this.searchLocalKnowledge(dto.companyId, question),
      this.retrieveFromBedrock(question),
    ]);

    const sources = [...bedrockSources, ...localSources].slice(0, 8);
    const answer = await this.generateAnswer(question, sources);

    return {
      data: {
        answer,
        sources: sources.map((source) => ({
          type: source.type,
          id: source.id,
          title: source.title,
          score: source.score,
          excerpt: source.content.slice(0, 240),
        })),
      },
    };
  }

  private async searchLocalKnowledge(companyId: string, question: string) {
    const terms = this.tokenize(question);

    const [faqs, chunks] = await Promise.all([
      this.prisma.fAQ.findMany({
        where: { companyId, isActive: true },
        orderBy: [{ updatedAt: "desc" }],
        take: 80,
      }),
      this.prisma.documentChunk.findMany({
        where: {
          document: {
            companyId,
            status: "AVAILABLE",
          },
        },
        include: {
          document: { select: { id: true, name: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    const faqSources = faqs.map<KnowledgeSource>((faq) => ({
      type: "FAQ",
      id: faq.id,
      title: faq.question,
      content: `質問: ${faq.question}\n回答: ${faq.answer}`,
      score: this.scoreText(`${faq.question} ${faq.answer} ${faq.category ?? ""}`, terms),
    }));

    const documentSources = chunks.map<KnowledgeSource>((chunk) => ({
      type: "DOCUMENT",
      id: chunk.document.id,
      title: chunk.document.name,
      content: chunk.content,
      score: this.scoreText(`${chunk.document.name} ${chunk.content}`, terms),
    }));

    return [...faqSources, ...documentSources]
      .filter((source) => (source.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 6);
  }

  private async retrieveFromBedrock(question: string): Promise<KnowledgeSource[]> {
    const knowledgeBaseId = process.env.BEDROCK_KNOWLEDGE_BASE_ID;
    if (!this.bedrockClient || !knowledgeBaseId) return [];

    try {
      const response = await this.bedrockClient.send(
        new RetrieveCommand({
          knowledgeBaseId,
          retrievalQuery: { text: question },
          retrievalConfiguration: {
            vectorSearchConfiguration: {
              numberOfResults: 5,
            },
          },
        })
      );

      return (response.retrievalResults ?? [])
        .map<KnowledgeSource | null>((result, index) => {
          const content = result.content?.text?.trim();
          if (!content) return null;

          const uri =
            result.location?.s3Location?.uri ??
            result.location?.webLocation?.url ??
            result.location?.customDocumentLocation?.id;

          return {
            type: "BEDROCK",
            title: uri ?? `Bedrock Knowledge Base ${index + 1}`,
            content,
            score: result.score,
          };
        })
        .filter((source): source is KnowledgeSource => source !== null);
    } catch {
      return [];
    }
  }

  private async generateAnswer(question: string, sources: KnowledgeSource[]) {
    if (sources.length === 0) {
      return "関連する情報が見つかりませんでした。登録済みのFAQまたは参考資料を確認してください。";
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
                "あなたは電話自動応答AIです。与えられた社内FAQ・資料の範囲だけで、短く自然な日本語で回答してください。不明な場合は不明と伝え、推測しないでください。",
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

  private contextOnlyAnswer(sources: KnowledgeSource[]) {
    const top = sources[0];
    return top.content.length > 600 ? `${top.content.slice(0, 600)}...` : top.content;
  }

  private tokenize(text: string) {
    const normalized = text
      .toLowerCase()
      .replace(/[、。,.!?！？「」『』（）()[\]{}:：;；/\\|]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const terms = new Set(
      normalized
        .split(" ")
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
    );

    const compact = normalized
      .replace(/\s+/g, "")
      .replace(/教えてください|教えて|ください|ですか|ますか|について/g, "");

    if (compact.length >= 2) {
      terms.add(compact);
      for (const size of [2, 3, 4]) {
        for (let i = 0; i <= compact.length - size; i += 1) {
          terms.add(compact.slice(i, i + size));
        }
      }
    }

    return Array.from(terms);
  }

  private scoreText(text: string, terms: string[]) {
    if (terms.length === 0) return 1;
    const lower = text
      .toLowerCase()
      .replace(/[、。,.!?！？「」『』（）()[\]{}:：;；/\\|]/g, " ")
      .replace(/\s+/g, "");

    return terms.reduce((score, term) => {
      if (!lower.includes(term.replace(/\s+/g, ""))) return score;
      return score + Math.max(1, Math.min(term.length, 6));
    }, 0);
  }
}
