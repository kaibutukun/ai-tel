/**
 * クライアントサイドの認証ユーティリティ
 *
 * トークンは Cookie に保存する（Next.js middleware から読み取れるようにするため）
 * HttpOnly ではないため XSS に注意 — 将来的にはサーバーサイドで Set-Cookie する形に移行する
 */

const TOKEN_KEY = "auth_token";
const USER_KEY = "auth_user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  companyId: string | null;
  role: string | null;
  adminRole: boolean;
}

/** JWT トークンを Cookie にセット（7日間有効） */
export function setAuthToken(token: string): void {
  const expires = new Date();
  expires.setDate(expires.getDate() + 7);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; expires=${expires.toUTCString()}; SameSite=Lax`;
}

/** Cookie からトークンを取得 */
export function getAuthToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** ログアウト — Cookie とローカルストレージをクリア */
export function clearAuth(): void {
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
  sessionStorage.removeItem(USER_KEY);
}

/** セッションストレージにユーザー情報をキャッシュ */
export function setCurrentUser(user: AuthUser): void {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** キャッシュ済みユーザー情報を取得 */
export function getCurrentUser(): AuthUser | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}
