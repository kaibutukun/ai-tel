import { apiClient } from "@/shared/api/http-client";

export interface CallSession {
  id: string;
  callerNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
  result: "AI_RESOLVED" | "TRANSFERRED" | "CALLBACK_REQUESTED" | "NO_ANSWER" | "VOICEMAIL";
  callFlow: { name: string } | null;
  phoneNumber: { number: string; displayName: string | null } | null;
}

export interface CallSessionDetail extends CallSession {
  recordingUrl: string | null;
  operatorNote: string | null;
  transcripts: { speaker: string; content: string; timestamp: number }[];
  summaries: { summary: string; extractedData: unknown; sentiment: string | null }[];
  sessionFaqs: { faq: { question: string } }[];
}

interface ListResponse { data: CallSession[]; meta: { total: number; page: number; limit: number } }
interface SingleResponse { data: CallSessionDetail }

export interface CallSessionsListParams {
  page?: number;
  limit?: number;
  callFlowId?: string;
  from?: string;
  to?: string;
}

export const callSessionsApi = {
  list: (companyId: string, params: CallSessionsListParams = {}) => {
    const query = new URLSearchParams({ companyId });
    query.set("page", String(params.page ?? 1));
    query.set("limit", String(params.limit ?? 20));
    if (params.callFlowId) query.set("callFlowId", params.callFlowId);
    if (params.from) query.set("from", params.from);
    if (params.to) query.set("to", params.to);
    return apiClient.get<ListResponse>(`/call-sessions?${query.toString()}`);
  },

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/call-sessions/${id}`),
};
