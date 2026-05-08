import { apiClient } from "./client";

export interface PhoneNumber {
  id: string;
  companyId: string;
  number: string;
  displayName: string | null;
  callFlowId: string | null;
  callFlow: { id: string; name: string } | null;
  transferTo: string | null;
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
interface SingleResponse { data: PhoneNumber }

export const phoneNumbersApi = {
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/phone-numbers?companyId=${companyId}`),

  get: (id: string) =>
    apiClient.get<SingleResponse>(`/phone-numbers/${id}`),

  update: (id: string, data: { displayName?: string; transferTo?: string; isActive?: boolean; callFlowId?: string }) =>
    apiClient.patch<SingleResponse>(`/phone-numbers/${id}`, data),
};
