"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  membersApi,
  type InvitationInfo,
  type MemberRole,
} from "@/entities/member/api/members-api";

interface InviteMemberModalProps {
  companyId: string;
  onClose: () => void;
  /** 招待完了後に呼ばれるコールバック（一覧の再取得に使用） */
  onInvited: () => void;
}

/**
 * メンバー招待モーダル
 * - フォームを送信すると User+CompanyMember+Invitation を作成し、招待URLを画面に表示
 * - メール送信は実装していないため、招待URLは運営/管理者が手元で相手に渡す
 */
export function InviteMemberModal({
  companyId,
  onClose,
  onInvited,
}: InviteMemberModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("GENERAL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [result, setResult] = useState<{
    invitation: InvitationInfo;
    memberName: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await membersApi.invite({ companyId, name, email, role });
      setResult({ invitation: res.invitation, memberName: res.data.name });
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : "招待に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {result ? "招待リンクを発行しました" : "メンバーを招待"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            disabled={loading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {result ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{result.memberName}</span> 宛の招待URLを発行しました。
              本人に渡してパスワードを設定してもらってください。
            </p>

            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={result.invitation.url}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => handleCopy(result.invitation.url)}
              >
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    コピー済
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    コピー
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              有効期限: {new Date(result.invitation.expiresAt).toLocaleString("ja-JP")}
            </p>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" onClick={onClose}>
                閉じる
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-name">名前</Label>
              <Input
                id="invite-name"
                placeholder="山田 太郎"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">メールアドレス</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="yamada@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role">ロール</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as MemberRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMIN">管理者</SelectItem>
                  <SelectItem value="GENERAL">一般</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                管理者はすべての設定を操作できます。一般は閲覧のみです。
              </p>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
                キャンセル
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "発行中..." : "招待URLを発行"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
