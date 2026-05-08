import { apiClient } from "./client";

export interface Document {
  id: string;
  companyId: string;
  name: string;
  type: "PDF" | "URL" | "TEXT";
  url: string | null;
  status: "PROCESSING" | "AVAILABLE" | "ERROR";
  usedInFlows: string[];
  updatedAt: string;
  createdAt: string;
}

interface ListResponse { data: Document[]; meta: { total: number } }

export const documentsApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/documents?companyId=${companyId}`),
};
