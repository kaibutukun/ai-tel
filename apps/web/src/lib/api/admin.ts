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

export interface AdminPhoneNumber {
  id: string;
  companyId: string | null;
  number: string;
  displayName: string | null;
  providerNumberId: string | null;
  provider: string;
  transferTo: string | null;
  isActive: boolean;
  createdAt: string;
  company: { id: string; name: string } | null;
}

export interface AdminPhoneNumberRequest {
  id: string;
  companyId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  company: { id: string; name: string };
}

interface ListResponse {
  data: AdminCompany[];
  meta: { total: number };
  stats: AdminStats;
}

interface SingleResponse { data: unknown }
interface PhoneNumberListResponse { data: AdminPhoneNumber[]; meta: { total: number } }
interface PhoneNumberResponse { data: AdminPhoneNumber }
interface PhoneNumberRequestListResponse { data: AdminPhoneNumberRequest[]; meta: { total: number } }
interface PhoneNumberRequestResponse { data: AdminPhoneNumberRequest }

export const adminApi = {
  listCompanies: () =>
    apiClient.get<ListResponse>("/admin/companies"),

  getCompany: (id: string) =>
    apiClient.get<SingleResponse>(`/admin/companies/${id}`),

  updateCompany: (id: string, data: { isActive?: boolean; adminNotes?: string }) =>
    apiClient.patch<SingleResponse>(`/admin/companies/${id}`, data),

  listPhoneNumbers: () =>
    apiClient.get<PhoneNumberListResponse>("/admin/phone-numbers"),

  createPhoneNumber: (data: {
    number: string;
    displayName?: string;
    providerNumberId?: string;
    companyId?: string;
  }) => apiClient.post<PhoneNumberResponse>("/admin/phone-numbers", data),

  assignPhoneNumber: (id: string, companyId?: string | null) =>
    apiClient.patch<PhoneNumberResponse>(`/admin/phone-numbers/${id}/assignment`, { companyId }),

  listPhoneNumberRequests: () =>
    apiClient.get<PhoneNumberRequestListResponse>("/admin/phone-number-requests"),

  updatePhoneNumberRequest: (
    id: string,
    data: { status?: AdminPhoneNumberRequest["status"]; adminNote?: string }
  ) => apiClient.patch<PhoneNumberRequestResponse>(`/admin/phone-number-requests/${id}`, data),
};
