import { apiClient } from "@/shared/api/http-client";

export interface DashboardStats {
  todayStats: {
    totalCalls: number;
    aiResolved: number;
    transferred: number;
    callbackRequested: number;
    unhandled: number;
  };
  weeklyCallData: { day: string; calls: number; resolved: number }[];
  topInquiries: { category: string; count: number }[];
  unansweredQuestions: string[];
}

interface DashboardResponse {
  data: DashboardStats;
}

export const dashboardApi = {
  getStats: (companyId: string) =>
    apiClient.get<DashboardResponse>(`/dashboard?companyId=${companyId}`),
};
