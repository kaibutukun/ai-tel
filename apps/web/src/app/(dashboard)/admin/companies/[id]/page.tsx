"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, Phone, Clock, CreditCard, FileText } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { adminApi } from "@/lib/api/admin";

export default function AdminCompanyDetailPage({ params }: { params: { id: string } }) {
  const [company, setCompany] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminApi.getCompany(params.id)
      .then((res: any) => {
        setCompany(res.data);
        setNotes(res.data.adminNotes ?? "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleSaveNotes = async () => {
    setSaving(true);
    try {
      await adminApi.updateCompany(params.id, { adminNotes: notes });
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
      await adminApi.updateCompany(params.id, { isActive: !company.isActive });
      setCompany((prev: any) => ({ ...prev, isActive: !prev.isActive }));
    } catch {
      alert("更新に失敗しました");
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
          <Link href="/admin"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button></Link>
          <p className="text-sm text-red-500 mt-4">企業が見つかりませんでした</p>
        </main>
      </>
    );
  }

  const now = new Date();
  const usage = company.usageRecords?.find(
    (r: any) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
  );

  return (
    <>
      <Header title="企業詳細" />
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />管理者ダッシュボードに戻る
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
            { label: "プラン", value: company.subscription?.plan?.name ?? "なし", icon: CreditCard },
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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />契約・請求情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "プラン", value: <Badge>{company.subscription?.plan?.name ?? "なし"}</Badge> },
                { label: "月額料金", value: <span className="text-sm font-medium">¥{(company.subscription?.plan?.priceMonthly ?? 0).toLocaleString()}</span> },
                { label: "ステータス", value: <Badge variant={company.isActive ? "success" : "secondary"}>{company.isActive ? "アクティブ" : "停止中"}</Badge> },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span className="text-sm text-gray-500">{label}</span>
                  {value}
                </div>
              ))}
            </CardContent>
          </Card>

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

          <Card className="lg:col-span-2">
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
