/**
 * 共通 fetch ラッパー
 *
 * - NEXT_PUBLIC_API_URL が未設定の場合は localhost:3001 を使用
 * - Cookie に auth_token があれば Authorization ヘッダーに自動付与
 * - TODO: auth 実装完了後は httpOnly Cookie + credentials: 'include' に移行する
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

/** Cookie から auth_token を取得（クライアントサイドのみ） */
function getTokenFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|; )auth_token=([^;]*)/);
  if (!match) return null;

  const token = decodeURIComponent(match[1]);
  return token && token !== "undefined" && token.split(".").length === 3
    ? token
    : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getTokenFromCookie();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = body.error?.message ?? body.message;
    throw new Error(
      Array.isArray(message)
        ? message.join(", ")
        : message ?? `API error: ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const token = getTokenFromCookie();

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });

  if (!res.ok) {
    const responseBody = await res.json().catch(() => ({}));
    const message = responseBody.error?.message ?? responseBody.message;
    throw new Error(
      Array.isArray(message)
        ? message.join(", ")
        : message ?? `API error: ${res.status}`
    );
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postForm: <T>(path: string, body: FormData) => requestForm<T>(path, body),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
