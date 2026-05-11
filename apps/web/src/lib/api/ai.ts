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
  // documentOnly=true を渡すと参考資料（DOCUMENT）のみを検索源にする
  answer: (data: { companyId: string; question: string; documentOnly?: boolean }) =>
    apiClient.post<AnswerResponse>("/ai/answer", data),
};
