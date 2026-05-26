"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  adminApi,
  type AdminInvitationInfo,
  type AdminPlanType,
} from "@/features/admin/api/admin-api";

interface CreateCompanyModalProps {
  onClose: () => void;
  /** 作成成功時に親側で一覧を再取得 + 招待リンクを表示 */
  onCreated: (info: {
    invitation: AdminInvitationInfo;
    companyName: string;
    adminEmail: string;
  }) => void;
}

const DEFAULT_MAX_MINUTES = 30;

export function CreateCompanyModal({ onClose, onCreated }: CreateCompanyModalProps) {
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [planType, setPlanType] = useState<AdminPlanType>("TRIAL");
  const [monthlyPrice, setMonthlyPrice] = useState(0);
  const [maxMinutes, setMaxMinutes] = useState(DEFAULT_MAX_MINUTES);
  const [endsAt, setEndsAt] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await adminApi.createCompany({
        name: name.trim(),
        adminName: adminName.trim(),
        adminEmail: adminEmail.trim(),
        planType,
        monthlyPrice: planType === "PAID" ? monthlyPrice : 0,
        maxMinutesPerMonth: maxMinutes,
        trialEndsAt: endsAt
          ? new Date(`${endsAt}T00:00:00`).toISOString()
          : null,
      });
      onCreated({
        invitation: res.data.invitation,
        companyName: res.data.company.name,
        adminEmail: res.data.admin.email,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "企業の作成に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && !loading && onClose()}
    >
      <div className="w-full max-w-lg space-y-5 rounded-lg bg-white p-6 shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">企業を作成</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            disabled={loading}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="company-name">企業名</Label>
            <Input
              id="company-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="株式会社サンプル"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">
              初代 管理者ユーザー
            </Label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="名前 (例: 山田 太郎)"
                required
              />
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@example.com"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>プラン種別</Label>
            <div className="flex flex-wrap gap-2">
              {(["TRIAL", "PAID"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPlanType(t)}
                  className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                    planType === t
                      ? "bg-blue-50 border-blue-500 text-blue-700"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {t === "TRIAL" ? "無料体験" : "有料会員"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {planType === "PAID" && (
              <div className="space-y-1.5">
                <Label htmlFor="company-price">月額料金 (円)</Label>
                <Input
                  id="company-price"
                  type="number"
                  min={0}
                  value={monthlyPrice}
                  onChange={(e) => setMonthlyPrice(Number(e.target.value) || 0)}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="company-max-min">月間通話分数 上限</Label>
              <Input
                id="company-max-min"
                type="number"
                min={0}
                value={maxMinutes}
                onChange={(e) => setMaxMinutes(Number(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="company-ends">期限日</Label>
              <Input
                id="company-ends"
                type="date"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "作成中..." : "作成して招待URLを発行"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
