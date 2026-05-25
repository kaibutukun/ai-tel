"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Building2, DollarSign, Phone, Clock } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { adminApi, type AdminCompany, type AdminStats } from "@/features/admin/api/admin-api";

const planVariants: Record<string, "default" | "secondary" | "outline" | "info" | "success"> = {
  TRIAL: "secondary",
  PAID: "success",
};

const planLabels: Record<string, string> = {
  TRIAL: "無料体験",
  PAID: "有料会員",
};

const billingVariants: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  PAID: "success", OPEN: "destructive", PAST_DUE: "warning", NONE: "secondary",
};

const billingLabels: Record<string, string> = {
  PAID: "支払済", OPEN: "未払い", PAST_DUE: "期限超過", VOID: "無効", NONE: "なし",
};

export function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await adminApi.listCompanies();
      setCompanies(res.data);
      setStats(res.stats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleActive = async (id: string, current: boolean) => {
    try {
      await adminApi.updateCompany(id, { isActive: !current });
      setCompanies((prev) => prev.map((c) => c.id === id ? { ...c, isActive: !current } : c));
    } catch {
      alert("更新に失敗しました");
    }
  };

  const totalMRR = stats?.totalMRR ?? 0;
  const totalCompanies = stats?.totalCompanies ?? 0;
  const totalCalls = stats?.totalCalls ?? 0;
  const totalMinutes = stats?.totalMinutes ?? 0;

  return (
    <>
      <Header title="企業管理" />
      <main className="flex-1 p-6 space-y-6">
        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "登録企業数", value: `${totalCompanies}社`, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "今月MRR", value: `¥${totalMRR.toLocaleString()}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
            { label: "今月の総通話数", value: `${totalCalls}件`, icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "今月の総通話時間", value: `${totalMinutes}分`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />登録企業一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["企業名", "プラン", "月額", "通話分上限", "今月通話", "請求", "有効", ""].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companies.length === 0 && !loading && (
                  <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">企業がありません</td></tr>
                )}
                {companies.map((company) => {
                  const planKey = company.planType ?? "";
                  return (
                    <tr key={company.id} className={`hover:bg-gray-50 ${!company.isActive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{company.name}</p>
                        <p className="text-xs text-gray-400">{company.createdAt}〜</p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={planVariants[planKey] ?? "secondary"}>
                          {planLabels[planKey] ?? company.plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {company.monthlyPrice > 0 ? `¥${company.monthlyPrice.toLocaleString()}` : "無料"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">{company.maxMinutesPerMonth}分</td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {company.callsThisMonth}件 / {company.minutesThisMonth}分
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={billingVariants[company.billingStatus] ?? "secondary"}>
                          {billingLabels[company.billingStatus] ?? company.billingStatus}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Switch checked={company.isActive} onCheckedChange={() => toggleActive(company.id, company.isActive)} />
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/companies/${company.id}`}>
                          <Button variant="outline" size="sm">詳細</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
