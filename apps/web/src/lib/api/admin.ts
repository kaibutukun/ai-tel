import { apiClient } from "./client";

export interface AdminCompany {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  planType: string | null;
  priceMonthly: number;
  callsThisMonth: number;
  minutesThisMonth: number;
  phoneNumbersCount: number;
  memberCount: number;
  billingStatus: string;
}

export interface AdminStats {
  totalCompanies: number;
  activeCompanies: number;
  totalMRR: number;
  totalCalls: number;
  totalMinutes: number;
}

interface ListResponse {
  data: AdminCompany[];
  meta: { total: number };
  stats: AdminStats;
}

interface SingleResponse { data: unknown }

export const adminApi = {
  listCompanies: () =>
    apiClient.get<ListResponse>("/admin/companies"),

  getCompany: (id: string) =>
    apiClient.get<SingleResponse>(`/admin/companies/${id}`),

  updateCompany: (id: string, data: { isActive?: boolean; adminNotes?: string }) =>
    apiClient.patch<SingleResponse>(`/admin/companies/${id}`, data),
};
