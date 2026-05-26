"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Phone } from "lucide-react";
import { inviteApi, type InvitationResolved } from "@/features/invite/api/invite-api";
import { setAuthToken, setCurrentUser } from "@/shared/auth/session";

interface InvitePageProps {
  token: string;
}

const ROLE_LABEL: Record<InvitationResolved["role"], string> = {
  ADMIN: "管理者",
  GENERAL: "一般",
};

export function InvitePage({ token }: InvitePageProps) {
  const router = useRouter();
  const [info, setInfo] = useState<InvitationResolved | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    inviteApi
      .resolve(token)
      .then((res) => {
        setInfo(res.data);
        setName(res.data.name);
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : "招待リンクの確認に失敗しました");
      })
      .finally(() => setLoadingInfo(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await inviteApi.accept(token, { name: name.trim() || undefined, password });
      setAuthToken(res.data.token);
      setCurrentUser(res.data.user);
      router.replace("/dashboard");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-sm border border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">アイテル</span>
        </div>

        {loadingInfo ? (
          <p className="text-sm text-gray-500">招待リンクを確認しています...</p>
        ) : loadError ? (
          <div className="space-y-3">
            <h1 className="text-lg font-semibold text-gray-900">招待リンクが無効です</h1>
            <p className="text-sm text-red-500">{loadError}</p>
            <p className="text-xs text-gray-400">
              リンクの有効期限が切れているか、既に使われています。発行元の管理者に再発行を依頼してください。
            </p>
          </div>
        ) : info ? (
          <>
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-gray-900">アカウントを設定</h1>
              <p className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">{info.companyName}</span>{" "}
                に <span className="font-medium">{ROLE_LABEL[info.role]}</span> として招待されています。
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={info.email}
                  disabled
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600"
                />
              </div>

              <div>
                <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 mb-1.5">
                  表示名
                </label>
                <input
                  id="invite-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label htmlFor="invite-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                  パスワード
                </label>
                <div className="relative">
                  <input
                    id="invite-password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="8文字以上"
                    className="w-full px-4 py-2.5 pr-11 rounded-lg border border-gray-300 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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

              {submitError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-600">{submitError}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold transition"
              >
                {submitting ? "登録中..." : "登録してログイン"}
              </button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
