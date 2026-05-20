import { apiClient } from "@/shared/api/http-client";
import type { AuthUser } from "@/shared/auth/session";

interface LoginResponse {
  data: {
    token: string;
    user: AuthUser;
  };
}

export const authApi = {
  /** メールアドレス＋パスワードでログイン */
  login: (email: string, password: string) =>
    apiClient.post<LoginResponse>("/auth/login", { email, password }),
};
