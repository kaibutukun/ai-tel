"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { membersApi, type MemberRole } from "@/lib/api/members";

interface InviteMemberModalProps {
  companyId: string;
  onClose: () => void;
  /** 招待完了後に呼ばれるコールバック（一覧の再取得に使用） */
  onInvited: () => void;
}

/**
 * メンバー招待モーダル
 * 名前・メールアドレス・ロールを入力して POST /api/members を呼び出す
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await membersApi.invite({ companyId, name, email, role });
      onInvited();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "招待に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    // バックドロップ
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-5">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            メンバーを招待
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム */}
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
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "送信中..." : "招待する"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
