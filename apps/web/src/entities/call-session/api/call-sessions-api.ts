import { apiClient } from "@/shared/api/http-client";

export interface CallSession {
  id: string;
  callerNumber: string | null;
  startedAt: string;
  durationSeconds: number | null;
  result: "AI_RESOLVED" | "TRANSFERRED" | "CALLBACK_REQUESTED" | "NO_ANSWER" | "VOICEMAIL";
  category: string | null;
  isAiHandled: boolean;
  callbackNeeded: boolean;
  callFlow: { name: string } | null;
  phoneNumber: { number: string; displayName: string | null } | null;
}

export interface CallSessionDetail extends CallSession {
  recordingUrl: string | null;
  operatorNote: string | null;
  transcripts: { speaker: string; content: string; timestamp: number }[];
  summaries: { summary: string; extractedData: unknown; sentiment: string | null }[];
  sessionFaqs: { faq: { question: string } }[];
  sessionDocs: { document: { name: string } }[];
}

interface ListResponse { data: CallSession[]; meta: { total: number; page: number; limit: number } }
interface SingleResponse { data: CallSessionDetail }

export const callSessionsApi = {
  list: (companyId: string, page = 1, limit = 20) =>
    apiClient.get<ListResponse>(`/call-sessions?companyId=${companyId}&page=${page}&limit=${limit}`),

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/call-sessions/${id}`),
};
