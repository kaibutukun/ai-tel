import { apiClient } from "./client";

export interface PhoneNumber {
  id: string;
  companyId: string | null;
  number: string;
  displayName: string | null;
  callFlowId: string | null;
  callFlow: { id: string; name: string } | null;
  transferTo: string | null;
  twilioSid: string | null;
  provider: string;
  isActive: boolean;
  businessHours: BusinessHour[];
  createdAt: string;
  updatedAt: string;
}

export interface BusinessHour {
  id: string;
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface ListResponse { data: PhoneNumber[]; meta: { total: number } }
export interface PhoneNumberRequest {
  id: string;
  companyId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELED";
  note: string | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SingleResponse { data: PhoneNumber }
interface RequestResponse { data: PhoneNumberRequest }

export const phoneNumbersApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/phone-numbers?companyId=${companyId}`),

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/phone-numbers/${id}`),

  requestAdditionalNumber: (data: { companyId: string; note?: string }) =>
    apiClient.post<RequestResponse>("/phone-numbers/requests", data),

  update: (id: string, data: { displayName?: string; transferTo?: string; isActive?: boolean; callFlowId?: string }) =>
    apiClient.patch<SingleResponse>(`/phone-numbers/${id}`, data),
};
