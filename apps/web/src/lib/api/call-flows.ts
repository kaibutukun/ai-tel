import { apiClient } from "./client";

export interface CallFlow {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: "PUBLISHED" | "DRAFT";
  flowJson: unknown;
  updatedAt: string;
  _count?: { phoneNumbers: number };
}

interface ListResponse { data: CallFlow[]; meta: { total: number } }
interface SingleResponse { data: CallFlow }

export const callFlowsApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/call-flows?companyId=${companyId}`),

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/call-flows/${id}`),

  create: (data: { companyId: string; name: string; description?: string; flowJson?: object }) =>
    apiClient.post<SingleResponse>("/call-flows", data),

  update: (id: string, data: { name?: string; description?: string; status?: "PUBLISHED" | "DRAFT"; flowJson?: object }) =>
    apiClient.patch<SingleResponse>(`/call-flows/${id}`, data),

  remove: (id: string) =>
    apiClient.delete<{ data: { message: string } }>(`/call-flows/${id}`),
};
