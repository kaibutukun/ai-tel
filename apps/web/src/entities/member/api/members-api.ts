import { apiClient } from "@/shared/api/http-client";

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

export interface InvitationInfo {
  token: string;
  url: string;
  expiresAt: string;
}

interface ListResponse {
  data: Member[];
  meta: { total: number };
}

interface SingleResponse {
  data: Member;
}

interface InviteResponse {
  data: Member;
  invitation: InvitationInfo;
}

interface ResendInvitationResponse {
  data: { invitation: InvitationInfo };
}

interface DeleteResponse {
  data: { message: string };
}

export const membersApi = {
  /** 指定会社のメンバー一覧を取得 */
  list: (companyId: string) =>
    apiClient.get<ListResponse>(`/members?companyId=${companyId}`),

  /** メンバーを招待（User+CompanyMember+Invitation を作成し、招待URLを返す） */
  invite: (data: {
    companyId: string;
    name: string;
    email: string;
    role: MemberRole;
  }) => apiClient.post<InviteResponse>("/members", data),

  /** メンバーのロールを変更 */
  updateRole: (memberId: string, role: MemberRole) =>
    apiClient.patch<SingleResponse>(`/members/${memberId}/role`, { role }),

  /** メンバーを削除 */
  remove: (memberId: string) =>
    apiClient.delete<DeleteResponse>(`/members/${memberId}`),

  /** 招待リンクを再発行 */
  resendInvitation: (memberId: string) =>
    apiClient.post<ResendInvitationResponse>(
      `/members/${memberId}/invitations`,
      {}
    ),
};
