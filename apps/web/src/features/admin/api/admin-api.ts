import { apiClient } from "@/shared/api/http-client";

export type AdminPlanType = "TRIAL" | "PAID";

export interface AdminCompany {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  planType: AdminPlanType | null;
  monthlyPrice: number;
  maxMinutesPerMonth: number;
  trialEndsAt: string | null;
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

export interface AdminCompanyPlanUpdate {
  planType: AdminPlanType;
  monthlyPrice: number;
  maxMinutesPerMonth: number;
  /** TRIAL のときに ISO 文字列。PAID なら null */
  trialEndsAt: string | null;
}

export interface AdminCreateCompanyInput {
  name: string;
  adminEmail: string;
  adminName: string;
  planType: AdminPlanType;
  monthlyPrice: number;
  maxMinutesPerMonth: number;
  trialEndsAt: string | null;
}

export interface AdminInvitationInfo {
  token: string;
  url: string;
  expiresAt: string;
}

export interface AdminCreateCompanyResponse {
  data: {
    company: { id: string; name: string; slug: string };
    admin: { id: string; email: string; name: string };
    invitation: AdminInvitationInfo;
  };
}

export interface AdminResendInvitationResponse {
  data: { invitation: AdminInvitationInfo };
}

export interface AdminCallSession {
  id: string;
  companyId: string;
  callerNumber: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  result: "AI_RESOLVED" | "TRANSFERRED" | "CALLBACK_REQUESTED" | "NO_ANSWER" | "VOICEMAIL";
  company: { id: string; name: string } | null;
  callFlow: { name: string } | null;
  phoneNumber: { number: string; displayName: string | null } | null;
}

export interface AdminCallSessionDetail extends AdminCallSession {
  recordingUrl: string | null;
  operatorNote: string | null;
  transcripts: { speaker: string; content: string; timestamp: number }[];
  summaries: { summary: string; extractedData: unknown; sentiment: string | null }[];
  sessionFaqs: { faq: { question: string } }[];
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
interface CallSessionListResponse {
  data: AdminCallSession[];
  meta: { total: number; page: number; limit: number };
}
interface CallSessionDetailResponse { data: AdminCallSessionDetail }

export interface AdminCallSessionsListParams {
  page?: number;
  limit?: number;
  companyId?: string;
  from?: string;
  to?: string;
}

export const adminApi = {
  listCompanies: () =>
    apiClient.get<ListResponse>("/admin/companies"),

  createCompany: (data: AdminCreateCompanyInput) =>
    apiClient.post<AdminCreateCompanyResponse>("/admin/companies", data),

  getCompany: (id: string) =>
    apiClient.get<SingleResponse>(`/admin/companies/${id}`),

  updateCompany: (id: string, data: { isActive?: boolean; adminNotes?: string }) =>
    apiClient.patch<SingleResponse>(`/admin/companies/${id}`, data),

  /** 企業ごとのプラン設定（種別・料金・上限・トライアル期限）を上書き */
  updateCompanyPlan: (id: string, data: AdminCompanyPlanUpdate) =>
    apiClient.put<SingleResponse>(`/admin/companies/${id}/plan`, data),

  /** 指定メンバー宛の招待リンクを再発行 */
  resendInvitation: (companyId: string, memberId: string) =>
    apiClient.post<AdminResendInvitationResponse>(
      `/admin/companies/${companyId}/members/${memberId}/invitations`,
      {}
    ),

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

  // ── 通話履歴 横断ビュー ───────────────────────────────────────
  listCallSessions: (params: AdminCallSessionsListParams = {}) => {
    const query = new URLSearchParams();
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 30));
    if (params.companyId) query.set("companyId", params.companyId);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    return apiClient.get<CallSessionListResponse>(
      `/admin/call-sessions?${query.toString()}`
    );
  },

  getCallSession: (id: string) =>
    apiClient.get<CallSessionDetailResponse>(`/admin/call-sessions/${id}`),
};
