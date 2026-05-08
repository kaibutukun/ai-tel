export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";

export type PlanType = "TRIAL" | "STARTER" | "BUSINESS" | "PRO" | "ENTERPRISE";

export type CallResult =
  | "AI_RESOLVED"
  | "TRANSFERRED"
  | "CALLBACK_REQUESTED"
  | "NO_ANSWER"
  | "VOICEMAIL";

export type DocumentStatus = "PROCESSING" | "AVAILABLE" | "ERROR";

export type FlowStatus = "PUBLISHED" | "DRAFT";

export type NotificationType = "EMAIL" | "SLACK" | "WEBHOOK";

export type SubscriptionStatus = "ACTIVE" | "INACTIVE" | "PAST_DUE" | "CANCELED";

export type InvoiceStatus = "DRAFT" | "OPEN" | "PAID" | "VOID" | "UNCOLLECTIBLE";

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}
