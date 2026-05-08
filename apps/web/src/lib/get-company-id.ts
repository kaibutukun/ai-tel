import { getCurrentUser, getAuthToken } from "./auth";

/**
 * 現在ログイン中のユーザーが所属する会社IDを返す
 *
 * 1. sessionStorage にキャッシュがあればそれを使う
 * 2. なければ Cookie の JWT ペイロードをデコードして取得
 *    （署名検証はサーバー側で行われるため、ここでは単純にデコードするだけ）
 */
export function getCompanyId(): string {
  // キャッシュ済みユーザー情報から取得
  const user = getCurrentUser();
  if (user?.companyId) return user.companyId;

  // JWT ペイロードをデコード
  const token = getAuthToken();
  if (!token) return "";
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.companyId ?? "";
  } catch {
    return "";
  }
}
