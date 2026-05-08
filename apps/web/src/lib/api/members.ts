import { apiClient } from "./client";

export type MemberRole = "ADMIN" | "GENERAL";

export interface Member {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role: MemberRole;
  joinedAt: string | null;
  isActive: boolean;
}

interface ListResponse {
  data: Member[];
  meta: { total: number };
}

interface SingleResponse {
  data: Member;
}

interface DeleteResponse {
  data: { message: string };
}

export const membersApi = {
  /** 指定会社のメンバー一覧を取得 */
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/members?companyId=${companyId}`),

  /** メンバーを招待（ユーザー作成 + CompanyMember 登録） */
  invite: (data: {
    companyId: string;
    name: string;
    email: string;
    role: MemberRole;
  }) => apiClient.post<SingleResponse>("/members", data),

  /** メンバーのロールを変更 */
  updateRole: (memberId: string, role: MemberRole) =>
    apiClient.patch<SingleResponse>(`/members/${memberId}/role`, { role }),

  /** メンバーを削除 */
  remove: (memberId: string) =>
    apiClient.delete<DeleteResponse>(`/members/${memberId}`),
};
