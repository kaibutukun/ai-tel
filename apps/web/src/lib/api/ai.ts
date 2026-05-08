import { apiClient } from "./client";

export interface AiSource {
  type: "FAQ" | "DOCUMENT" | "BEDROCK";
  id?: string;
  title: string;
  score?: number;
  excerpt: string;
}

interface AnswerResponse {
  data: {
    answer: string;
    sources: AiSource[];
  };
}

export const aiApi = {
  answer: (data: { companyId: string; question: string }) =>
    apiClient.post<AnswerResponse>("/ai/answer", data),
};
