import { apiClient } from "./client";
import type { AuthUser } from "../auth";

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
