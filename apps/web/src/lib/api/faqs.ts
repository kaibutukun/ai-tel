import { apiClient } from "./client";

export interface Faq {
  id: string;
  companyId: string;
  category: string | null;
  question: string;
  answer: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse { data: Faq[]; meta: { total: number } }
interface SingleResponse { data: Faq }

export const faqsApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/faqs?companyId=${companyId}`),

  create: (data: { companyId: string; category?: string; question: string; answer: string; priority?: number }) =>
    apiClient.post<SingleResponse>("/faqs", data),

  update: (id: string, data: Partial<Faq>) =>
    apiClient.patch<SingleResponse>(`/faqs/${id}`, data),

  remove: (id: string) =>
    apiClient.delete<{ data: { message: string } }>(`/faqs/${id}`),
};
