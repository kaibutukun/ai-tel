import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** 認証不要なパス（前方一致） */
const PUBLIC_PATHS = ["/login"];

/**
 * Next.js エッジミドルウェア
 *
 * - auth_token Cookie が存在しない場合は /login へリダイレクト
 * - ログイン済みで /login にアクセスした場合は /dashboard へリダイレクト
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("auth_token")?.value;
  const hasValidToken = token?.split(".").length === 3;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  if (isPublic) {
    // ログイン済みならダッシュボードへ
    if (hasValidToken) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    const response = NextResponse.next();
    if (token) response.cookies.delete("auth_token");
    return response;
  }

  // 未ログインならログインページへ
  if (!hasValidToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (token) response.cookies.delete("auth_token");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  // _next/static, _next/image, favicon, 画像ファイルはスキップ
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
