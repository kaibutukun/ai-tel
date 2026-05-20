import { apiClient } from "@/shared/api/http-client";

export interface Document {
  id: string;
  companyId: string;
  name: string;
  type: "PDF" | "URL" | "TEXT";
  url: string | null;
  content?: string | null;
  status: "PROCESSING" | "AVAILABLE" | "ERROR";
  usedInFlows: string[];
  updatedAt: string;
  createdAt: string;
}

interface ListResponse { data: Document[]; meta: { total: number } }
interface SingleResponse { data: Document }

export interface DocumentPayload {
  companyId: string;
  name: string;
  type: "PDF" | "URL" | "TEXT";
  url?: string;
  content?: string;
}

export const documentsApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/documents?companyId=${companyId}`),

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/documents/${id}`),

  create: (data: DocumentPayload) =>
    apiClient.post<SingleResponse>("/documents", data),

  uploadPdf: (data: { companyId: string; file: File; name?: string }) => {
    const form = new FormData();
    form.append("companyId", data.companyId);
    form.append("file", data.file);
    if (data.name) form.append("name", data.name);
    return apiClient.postForm<SingleResponse>("/documents/upload", form);
  },

  update: (id: string, data: Partial<Omit<DocumentPayload, "companyId">>) =>
    apiClient.patch<SingleResponse>(`/documents/${id}`, data),

  remove: (id: string) =>
    apiClient.delete<{ data: { message: string } }>(`/documents/${id}`),
};
