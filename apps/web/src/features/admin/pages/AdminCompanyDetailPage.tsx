"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Phone, Clock, CreditCard, Users, RefreshCcw } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Textarea } from "@/shared/ui/textarea";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { InvitationLinkDialog } from "@/features/admin/components/InvitationLinkDialog";
import { adminApi, type AdminInvitationInfo, type AdminPlanType } from "@/features/admin/api/admin-api";

interface AdminCompanyDetailPageProps {
  id: string;
}

interface PlanForm {
  planType: AdminPlanType;
  monthlyPrice: number;
  maxMinutesPerMonth: number;
  trialEndsAt: string; // "yyyy-MM-dd" (空文字 = 未設定)
}

const DEFAULT_PLAN: PlanForm = {
  planType: "TRIAL",
  monthlyPrice: 0,
  maxMinutesPerMonth: 30,
  trialEndsAt: "",
};

function isoToDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function AdminCompanyDetailPage({ id }: AdminCompanyDetailPageProps) {
  const [company, setCompany] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [planForm, setPlanForm] = useState<PlanForm>(DEFAULT_PLAN);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [resendingMemberId, setResendingMemberId] = useState<string | null>(null);
  const [invitationResult, setInvitationResult] = useState<{
    info: AdminInvitationInfo;
    memberName: string;
  } | null>(null);

  useEffect(() => {
    adminApi.getCompany(id)
      .then((res: any) => {
        const c = res.data;
        setCompany(c);
        setNotes(c.adminNotes ?? "");
        const sub = c.subscription;
        setPlanForm({
          planType: (sub?.plan?.type as AdminPlanType) ?? "TRIAL",
          monthlyPrice: sub?.monthlyPrice ?? 0,
          maxMinutesPerMonth: sub?.maxMinutesPerMonth ?? 30,
          trialEndsAt: isoToDateInput(sub?.trialEndsAt),
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await adminApi.updateCompany(id, { adminNotes: notes });
    } catch {
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!company) return;
    if (company.isActive) {
      setStopDialogOpen(true);
      return;
    }
    await applyToggleActive();
  };

  const applyToggleActive = async () => {
    if (!company) return;
    setTogglingActive(true);
    try {
      await adminApi.updateCompany(id, { isActive: !company.isActive });
      setCompany((prev: any) => ({ ...prev, isActive: !prev.isActive }));
      setStopDialogOpen(false);
    } catch {
      alert("更新に失敗しました");
    } finally {
      setTogglingActive(false);
    }
  };

  const handleResendInvitation = async (memberId: string, memberName: string) => {
    setResendingMemberId(memberId);
    try {
      const res = await adminApi.resendInvitation(id, memberId);
      setInvitationResult({ info: res.data.invitation, memberName });
    } catch (e: any) {
      alert(e?.message ?? "招待リンクの再発行に失敗しました");
    } finally {
      setResendingMemberId(null);
    }
  };

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      const res: any = await adminApi.updateCompanyPlan(id, {
        planType: planForm.planType,
        monthlyPrice: planForm.planType === "PAID" ? planForm.monthlyPrice : 0,
        maxMinutesPerMonth: planForm.maxMinutesPerMonth,
        trialEndsAt: planForm.trialEndsAt
          ? new Date(`${planForm.trialEndsAt}T00:00:00`).toISOString()
          : null,
      });
      setCompany((prev: any) => ({ ...prev, subscription: res.data }));
    } catch (e: any) {
      alert(e?.message ?? "保存に失敗しました");
    } finally {
      setSavingPlan(false);
    }
  };

  if (loading) {
    return (
      <>
        <Header title="企業詳細" />
        <main className="flex-1 w-full p-4 sm:p-6">
          <p className="text-sm text-gray-400">読み込み中...</p>
        </main>
      </>
    );
  }

  if (!company) {
    return (
      <>
        <Header title="企業詳細" />
        <main className="flex-1 w-full p-4 sm:p-6">
          <Link href="/admin/companies"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button></Link>
          <p className="text-sm text-red-500 mt-4">企業が見つかりませんでした</p>
        </main>
      </>
    );
  }

  const now = new Date();
  const usage = company.usageRecords?.find(
    (r: any) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
  );
  const planLabel = planForm.planType === "PAID" ? "有料会員" : "無料体験";

  return (
    <>
      <Header title="企業詳細" />
      <main className="flex-1 w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Link href="/admin/companies">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />企業管理に戻る
          </Button>
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50">
              <Building2 className="h-6 w-6 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-gray-900 sm:text-xl">{company.name}</h2>
              <p className="text-sm text-gray-500">
                登録日: {new Date(company.createdAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className={`w-full shrink-0 sm:w-auto ${company.isActive ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}`}
            onClick={handleToggleActive}
          >
            {company.isActive ? "アカウント停止" : "アカウント有効化"}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { label: "プラン", value: planLabel, icon: CreditCard, color: "text-green-600", bg: "bg-green-50" },
            { label: "今月通話数", value: `${usage?.totalCalls ?? 0}件`, icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "今月通話時間", value: `${usage?.totalMinutes ?? 0}分`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}>
                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-xl font-bold text-gray-900 sm:text-2xl">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />プラン設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm">プラン種別</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["TRIAL", "PAID"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPlanForm((p) => ({ ...p, planType: t }))}
                    className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
                      planForm.planType === t
                        ? "bg-blue-50 border-blue-500 text-blue-700"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {t === "TRIAL" ? "無料体験" : "有料会員"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {planForm.planType === "PAID" && (
                <div>
                  <Label htmlFor="monthlyPrice" className="text-sm">月額料金 (円)</Label>
                  <Input
                    id="monthlyPrice"
                    type="number"
                    min={0}
                    value={planForm.monthlyPrice}
                    onChange={(e) =>
                      setPlanForm((p) => ({ ...p, monthlyPrice: Number(e.target.value) || 0 }))
                    }
                  />
                </div>
              )}

              <div>
                <Label htmlFor="maxMinutes" className="text-sm">月間通話分数 上限</Label>
                <Input
                  id="maxMinutes"
                  type="number"
                  min={0}
                  value={planForm.maxMinutesPerMonth}
                  onChange={(e) =>
                    setPlanForm((p) => ({ ...p, maxMinutesPerMonth: Number(e.target.value) || 0 }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="trialEndsAt" className="text-sm">期限日</Label>
                <Input
                  id="trialEndsAt"
                  type="date"
                  value={planForm.trialEndsAt}
                  onChange={(e) =>
                    setPlanForm((p) => ({ ...p, trialEndsAt: e.target.value }))
                  }
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              ※ 電話番号は1企業につき1つまで（固定）
            </p>

            <Button size="sm" className="w-full sm:w-auto" onClick={handleSavePlan} disabled={savingPlan}>
              {savingPlan ? "保存中..." : "プラン設定を保存"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />メンバー
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!company.members || company.members.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-400">メンバーがいません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["名前", "メール", "ロール", "状態", ""].map((h) => (
                        <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {company.members.map((m: any) => {
                      const pending = !m.hasPassword;
                      const resending = resendingMemberId === m.id;
                      return (
                        <tr key={m.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.user.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{m.user.email}</td>
                          <td className="px-4 py-3">
                            <Badge variant={m.role === "ADMIN" ? "secondary" : "outline"}>
                              {m.role === "ADMIN" ? "管理者" : "一般"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            {pending ? (
                              <Badge variant="warning">招待中</Badge>
                            ) : (
                              <Badge variant="success">参加済</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {pending && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleResendInvitation(m.id, m.user.name)}
                                disabled={resending}
                              >
                                <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
                                {resending ? "発行中..." : "招待リンク再発行"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>管理メモ</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="企業に関するメモを入力..."
            />
            <Button size="sm" className="w-full sm:w-auto" onClick={handleSaveNotes} disabled={saving}>
              {saving ? "保存中..." : "メモを保存"}
            </Button>
          </CardContent>
        </Card>
      </main>

      {invitationResult && (
        <InvitationLinkDialog
          title="招待リンクを再発行しました"
          description={`${invitationResult.memberName} 宛の新しい招待URLです。古いリンクは無効になります。`}
          url={invitationResult.info.url}
          expiresAt={invitationResult.info.expiresAt}
          onClose={() => setInvitationResult(null)}
        />
      )}

      {stopDialogOpen && (
        <ConfirmDialog
          title="この企業を停止しますか？"
          description={
            <div className="space-y-2">
              <p>
                <span className="font-semibold text-gray-900">{company.name}</span> を停止します。
              </p>
              <p className="text-xs text-gray-500">
                停止中はログインや新規通話の受付ができなくなります。あとから「アカウント有効化」で復帰できます。
              </p>
            </div>
          }
          confirmLabel="停止する"
          cancelLabel="キャンセル"
          loading={togglingActive}
          onCancel={() => setStopDialogOpen(false)}
          onConfirm={applyToggleActive}
        />
      )}
    </>
  );
}
