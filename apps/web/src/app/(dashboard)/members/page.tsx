"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { RoleSelector } from "@/components/members/RoleSelector";
import { InviteMemberModal } from "@/components/members/InviteMemberModal";
import { membersApi, type Member, type MemberRole } from "@/lib/api/members";
import { getCompanyId } from "@/lib/get-company-id";

const ROLE_BADGE: Record<
  MemberRole,
  { label: string; variant: "secondary" | "outline" }
> = {
  ADMIN: { label: "管理者", variant: "secondary" },
  GENERAL: { label: "一般", variant: "outline" },
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  // メンバー一覧をバックエンドから取得
  const fetchMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const companyId = getCompanyId();
      if (!companyId) { setLoading(false); return; }
      const res = await membersApi.list(companyId);
      setMembers(res.data);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "メンバーの取得に失敗しました"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ロール変更
  const handleRoleChange = async (memberId: string, role: MemberRole) => {
    try {
      const res = await membersApi.updateRole(memberId, role);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: res.data.role } : m))
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "ロールの変更に失敗しました");
    }
  };

  // メンバー削除
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await membersApi.remove(deleteTarget.id);
      setMembers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "メンバーの削除に失敗しました");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Header title="メンバー管理" />
      <main className="flex-1 p-6 space-y-6">
        {/* ヘッダー行 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            メンバー: {loading ? "—" : `${members.length} 名`}
          </p>
          <Button onClick={() => setShowInviteModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            メンバーを招待
          </Button>
        </div>

        {/* ローディング / エラー */}
        {loading && (
          <p className="text-sm text-gray-500 py-8 text-center">読み込み中...</p>
        )}
        {error && (
          <p className="text-sm text-red-500 py-8 text-center">{error}</p>
        )}

        {/* メンバーテーブル */}
        {!loading && !error && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["名前", "メールアドレス", "ロール", "参加日", "ステータス", "操作"].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-10 text-center text-sm text-gray-400"
                    >
                      メンバーがいません。招待ボタンから追加してください。
                    </td>
                  </tr>
                )}
                {members.map((member) => {
                  const badge = ROLE_BADGE[member.role];
                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-gray-50 ${!member.isActive ? "opacity-50" : ""}`}
                    >
                      {/* 名前 */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-700 shrink-0">
                            {member.name[0]}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {member.name}
                          </span>
                        </div>
                      </td>

                      {/* メール */}
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {member.email}
                      </td>

                      {/* ロール（セレクトで変更可能） */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                          <RoleSelector
                            role={member.role}
                            onChange={(role) =>
                              handleRoleChange(member.id, role)
                            }
                          />
                        </div>
                      </td>

                      {/* 参加日 */}
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {member.joinedAt ?? "—"}
                      </td>

                      {/* ステータス */}
                      <td className="px-6 py-4">
                        <Badge
                          variant={member.isActive ? "success" : "secondary"}
                        >
                          {member.isActive ? "アクティブ" : "非アクティブ"}
                        </Badge>
                      </td>

                      {/* 操作 */}
                      <td className="px-6 py-4">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTarget(member)}
                          title="メンバーを削除"
                        >
                          <Trash2 className="w-4 h-4 text-red-400" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 招待モーダル */}
        {showInviteModal && (
          <InviteMemberModal
            companyId={getCompanyId()}
            onClose={() => setShowInviteModal(false)}
            onInvited={fetchMembers}
          />
        )}

        {deleteTarget && (
          <ConfirmDialog
            title="メンバーを削除しますか？"
            description={
              <>
                <span className="font-medium text-gray-900">{deleteTarget.name}</span> をメンバーから削除します。この操作は取り消せません。
              </>
            }
            confirmLabel="削除する"
            loading={deleting}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
      </main>
    </>
  );
}
