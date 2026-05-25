"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Phone, Clock, CreditCard, FileText } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Textarea } from "@/shared/ui/textarea";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { adminApi, type AdminPlanType } from "@/features/admin/api/admin-api";

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
    if (!confirm(`この企業を${company.isActive ? "停止" : "有効化"}しますか？`)) return;
    try {
      await adminApi.updateCompany(id, { isActive: !company.isActive });
      setCompany((prev: any) => ({ ...prev, isActive: !prev.isActive }));
    } catch {
      alert("更新に失敗しました");
    }
  };

  const handleSavePlan = async () => {
    setSavingPlan(true);
    try {
      const res: any = await adminApi.updateCompanyPlan(id, {
        planType: planForm.planType,
        monthlyPrice: planForm.planType === "PAID" ? planForm.monthlyPrice : 0,
        maxMinutesPerMonth: planForm.maxMinutesPerMonth,
        trialEndsAt:
          planForm.planType === "TRIAL" && planForm.trialEndsAt
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
        <main className="flex-1 p-6"><p className="text-sm text-gray-400">読み込み中...</p></main>
      </>
    );
  }

  if (!company) {
    return (
      <>
        <Header title="企業詳細" />
        <main className="flex-1 p-6">
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
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        <Link href="/admin/companies">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />企業管理に戻る
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
              <p className="text-sm text-gray-500">
                登録日: {new Date(company.createdAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            className={company.isActive ? "text-red-600 border-red-200 hover:bg-red-50" : "text-green-600 border-green-200 hover:bg-green-50"}
            onClick={handleToggleActive}
          >
            {company.isActive ? "アカウント停止" : "アカウント有効化"}
          </Button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "プラン", value: planLabel, icon: CreditCard },
            { label: "今月通話数", value: `${usage?.totalCalls ?? 0}件`, icon: Phone },
            { label: "今月通話時間", value: `${usage?.totalMinutes ?? 0}分`, icon: Clock },
            { label: "電話番号数", value: `${company.phoneNumbers?.length ?? 0}番号`, icon: Phone },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{value}</p>
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
              <div className="mt-2 flex gap-2">
                {(["TRIAL", "PAID"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPlanForm((p) => ({ ...p, planType: t }))}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
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

              {planForm.planType === "TRIAL" && (
                <div>
                  <Label htmlFor="trialEndsAt" className="text-sm">トライアル期限日</Label>
                  <Input
                    id="trialEndsAt"
                    type="date"
                    value={planForm.trialEndsAt}
                    onChange={(e) =>
                      setPlanForm((p) => ({ ...p, trialEndsAt: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400">
              ※ 電話番号は1企業につき1つまで（固定）
            </p>

            <Button size="sm" onClick={handleSavePlan} disabled={savingPlan}>
              {savingPlan ? "保存中..." : "プラン設定を保存"}
            </Button>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />請求履歴
              </CardTitle>
            </CardHeader>
            <CardContent>
              {company.invoices?.length > 0 ? (
                <div className="space-y-2">
                  {company.invoices.map((inv: any) => (
                    <div key={`${inv.year}-${inv.month}`} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-700">{inv.year}/{String(inv.month).padStart(2, "0")}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium">¥{inv.total.toLocaleString()}</span>
                        <Badge variant={inv.status === "PAID" ? "success" : "secondary"}>
                          {inv.status === "PAID" ? "支払済" : inv.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">請求履歴がありません</p>
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
              <Button size="sm" onClick={handleSaveNotes} disabled={saving}>
                {saving ? "保存中..." : "メモを保存"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
