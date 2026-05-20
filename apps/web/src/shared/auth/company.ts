import { getCurrentUser, getAuthToken } from "./session";
import { decodeJwtPayload } from "./jwt";

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
  const payload = decodeJwtPayload(token);
  return typeof payload?.companyId === "string" ? payload.companyId : "";
}
