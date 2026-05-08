"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Phone,
  LayoutDashboard,
  MessageSquare,
  FileText,
  GitBranch,
  PhoneCall,
  Bell,
  Users,
  Settings,
  Shield,
  Building2,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAuth, getCurrentUser, getAuthToken } from "@/lib/auth";
import { useEffect, useState } from "react";

const navItems = [
  { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
  { href: "/phone-numbers", label: "電話番号", icon: Phone },
  { href: "/call-flows", label: "対応フロー", icon: GitBranch },
  { href: "/faqs", label: "FAQ", icon: MessageSquare },
  { href: "/documents", label: "参考資料", icon: FileText },
  { href: "/call-logs", label: "通話ログ", icon: PhoneCall },
  { href: "/notifications", label: "通知設定", icon: Bell },
  { href: "/members", label: "メンバー", icon: Users },
];

const adminItems = [
  { href: "/admin", label: "管理者画面", icon: Shield },
  { href: "/admin/companies", label: "企業管理", icon: Building2 },
];

/** base64url → JSON（JWTペイロードのデコード用） */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    // base64url を標準 base64 に変換してパディングを補完
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ name: string; email: string; adminRole: boolean } | null>(null);

  useEffect(() => {
    const token = getAuthToken();
    const cached = getCurrentUser();

    // adminRole はJWT（サーバー発行・改ざん検証済み）を正として扱う
    const jwtPayload = token ? decodeJwtPayload(token) : null;
    const adminRole = Boolean(jwtPayload?.adminRole);
    const email = (jwtPayload?.email as string) ?? cached?.email ?? "";

    // 表示名はsessionStorageのキャッシュを優先（JWTには name が入っていない）
    const name = cached?.name ?? email;

    setUser({ name, email, adminRole });
  }, []);

  const handleLogout = () => {
    clearAuth();
    // router.push だとブラウザキャッシュが残ることがあるので完全リロード
    window.location.href = "/login";
  };

  const initial = user?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 flex flex-col">
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Phone className="w-4 h-4 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">アイテル</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}

        {user?.adminRole && (
          <>
            <div className="pt-4 pb-2">
              <p className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                運営者
              </p>
            </div>
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname === href || pathname.startsWith(href + "/")
                    ? "bg-purple-50 text-purple-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-2">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
        >
          <Settings className="w-4 h-4" />
          設定
        </Link>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          ログアウト
        </button>

        <div className="mt-1 flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700 flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{user?.name ?? "—"}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email ?? "—"}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
