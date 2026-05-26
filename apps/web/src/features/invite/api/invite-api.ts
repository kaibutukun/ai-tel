import { apiClient } from "@/shared/api/http-client";
import type { AuthUser } from "@/shared/auth/session";

export interface InvitationResolved {
  email: string;
  name: string;
  companyName: string;
  role: "ADMIN" | "GENERAL";
  expiresAt: string;
}

interface ResolveResponse {
  data: InvitationResolved;
}

interface AcceptResponse {
  data: {
    token: string;
    user: AuthUser;
  };
}

export const inviteApi = {
  /** トークン検証 + 表示用の情報を返す */
  resolve: (token: string) =>
    apiClient.get<ResolveResponse>(`/invitations/${token}`),

  /** 名前(任意)とパスワードでパスワード設定 → JWT を発行 */
  accept: (token: string, body: { name?: string; password: string }) =>
    apiClient.post<AcceptResponse>(`/invitations/${token}/accept`, body),
};
