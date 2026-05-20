import { apiClient } from "@/shared/api/http-client";

export interface AiSource {
  type: "BEDROCK";
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
  // minScore を渡すと類似度の閾値を上書きできる（フロー側の rag 精度設定に合わせる用途）
  answer: (data: { companyId: string; question: string; minScore?: number }) =>
    apiClient.post<AnswerResponse>("/ai/answer", data),
};
