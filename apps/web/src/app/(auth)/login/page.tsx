"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Phone, Bot, Clock, Shield, ChevronRight, Eye, EyeOff } from "lucide-react";
import { authApi } from "@/lib/api/auth";
import { setAuthToken, setCurrentUser } from "@/lib/auth";

// ─── ログインフォーム本体（useSearchParams を使うため Suspense でラップ）─────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await authApi.login(email, password);
      setAuthToken(res.data.token);
      setCurrentUser(res.data.user);

      const from = searchParams.get("from") ?? "/dashboard";
      router.replace(from);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* メールアドレス */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
          メールアドレス
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
      </div>

      {/* パスワード */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
          パスワード
        </label>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-2.5 pr-11 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* エラー */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* ログインボタン */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ログイン中...
          </>
        ) : (
          <>
            ログイン
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      <p className="text-center text-xs text-gray-400">
        パスワードをお忘れの方は管理者にお問い合わせください
      </p>
    </form>
  );
}

// ─── ページ本体 ─────────────────────────────────────────────────────────────
export default function LoginPage() {
  // デモ用ヒント表示フラグ（開発環境のみ）
  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="min-h-screen flex">
      {/* ── 左パネル：ブランディング ── */}
      <div className="hidden lg:flex flex-col justify-between w-[480px] bg-gradient-to-br from-blue-600 to-indigo-700 p-12 flex-shrink-0">
        {/* ロゴ */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">アイテル</span>
        </div>

        {/* キャッチコピー */}
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-white leading-snug">
              電話対応を<br />AIにまかせよう
            </h2>
            <p className="mt-4 text-blue-100 text-sm leading-relaxed">
              AIが24時間365日、あなたの会社の電話に対応。<br />
              スタッフは本当に必要な業務に集中できます。
            </p>
          </div>

          {/* 特徴 */}
          <div className="space-y-3">
            {[
              { icon: Bot, text: "AIによる自然な会話対応" },
              { icon: Clock, text: "24時間365日無人対応" },
              { icon: Shield, text: "通話内容の自動記録・要約" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm text-blue-100">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs text-blue-200">© 2024 アイテル. All rights reserved.</p>
      </div>

      {/* ── 右パネル：ログインフォーム ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-50">
        {/* モバイル用ロゴ */}
        <div className="lg:hidden flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">アイテル</span>
        </div>

        <div className="w-full max-w-sm">
          {/* ヘッダー */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">ログイン</h1>
            <p className="mt-1 text-sm text-gray-500">
              管理画面にアクセスするにはログインしてください
            </p>
          </div>

          {/* フォーム（Suspense でラップして useSearchParams を安全に使用） */}
          <Suspense fallback={<div className="h-48 flex items-center justify-center"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>}>
            <LoginForm />
          </Suspense>

          {/* 開発用ヒント */}
          {isDev && (
            <div className="mt-6 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs font-medium text-amber-700 mb-1">デモ用ログイン情報</p>
              <p className="text-xs text-amber-600">メール: kaibutukun1201@gmail.com</p>
              <p className="text-xs text-amber-600">パスワード: testkai</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
