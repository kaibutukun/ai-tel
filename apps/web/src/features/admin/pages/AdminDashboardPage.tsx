"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Building2,
  DollarSign,
  TrendingUp,
  Phone,
  AlertTriangle,
  Clock,
  CreditCard,
  CalendarClock,
} from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { adminApi, type AdminCompany, type AdminStats } from "@/features/admin/api/admin-api";

const yen = (n: number) => `¥${n.toLocaleString()}`;

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return Math.floor(diff);
}

export function AdminDashboardPage() {
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metrics = useMemo(() => {
    const total = companies.length;
    const paid = companies.filter((c) => c.planType === "PAID").length;
    const trial = companies.filter((c) => c.planType === "TRIAL").length;
    const inactive = companies.filter((c) => !c.isActive).length;
    const mrr = stats?.totalMRR ?? 0;
    const arr = mrr * 12;
    const arpu = paid > 0 ? Math.round(mrr / paid) : 0;

    const billingOverdue = companies.filter(
      (c) => c.billingStatus === "PAST_DUE" || c.billingStatus === "OPEN"
    );
    const trialEndingSoon = companies
      .map((c) => ({ c, days: daysUntil(c.trialEndsAt) }))
      .filter((x): x is { c: AdminCompany; days: number } =>
        x.c.planType === "TRIAL" && x.days !== null && x.days <= 7
      )
      .sort((a, b) => a.days - b.days);
    const nearLimit = companies
      .filter((c) => c.maxMinutesPerMonth > 0)
      .map((c) => ({ c, ratio: c.minutesThisMonth / c.maxMinutesPerMonth }))
      .filter((x) => x.ratio >= 0.8)
      .sort((a, b) => b.ratio - a.ratio);
    const topUsage = [...companies]
      .filter((c) => c.minutesThisMonth > 0)
      .sort((a, b) => b.minutesThisMonth - a.minutesThisMonth)
      .slice(0, 5);

    return {
      total, paid, trial, inactive,
      mrr, arr, arpu,
      billingOverdue, trialEndingSoon, nearLimit, topUsage,
    };
  }, [companies, stats]);

  const kpis = [
    {
      label: "今月MRR",
      value: yen(metrics.mrr),
      sub: `ARPU ${yen(metrics.arpu)}`,
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "年商換算 (ARR)",
      value: yen(metrics.arr),
      sub: "MRR × 12",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "有料企業",
      value: `${metrics.paid}社`,
      sub: `全${metrics.total}社中`,
      icon: Building2,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "今月通話時間",
      value: `${stats?.totalMinutes ?? 0}分`,
      sub: `${stats?.totalCalls ?? 0}件`,
      icon: Phone,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const planSegments = (() => {
    const total = Math.max(metrics.total, 1);
    return [
      { label: "有料", count: metrics.paid, color: "bg-green-500", pct: (metrics.paid / total) * 100 },
      { label: "無料体験", count: metrics.trial, color: "bg-blue-400", pct: (metrics.trial / total) * 100 },
      { label: "停止中", count: metrics.inactive, color: "bg-gray-400", pct: (metrics.inactive / total) * 100 },
    ];
  })();

  return (
    <>
      <Header title="運営ダッシュボード" />
      <main className="flex-1 w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-500">{k.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${k.bg} flex items-center justify-center`}>
                    <k.icon className={`w-4 h-4 ${k.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{k.value}</p>
                <p className="mt-1 text-xs text-gray-400">{k.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Building2 className="w-4 h-4 text-gray-500" />プラン内訳
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex h-2 overflow-hidden rounded-full bg-gray-100">
                {planSegments.map((s) =>
                  s.pct > 0 ? (
                    <div key={s.label} className={s.color} style={{ width: `${s.pct}%` }} />
                  ) : null
                )}
              </div>
              <div className="space-y-2">
                {planSegments.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${s.color}`} />
                      <span className="text-gray-600">{s.label}</span>
                    </div>
                    <span className="font-medium text-gray-900">{s.count}社</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500" />要対応
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AlertRow
                icon={CreditCard}
                tone="red"
                label="請求の未払い・期限超過"
                empty="該当なし"
                items={metrics.billingOverdue.map((c) => ({
                  id: c.id,
                  title: c.name,
                  hint: c.billingStatus === "PAST_DUE" ? "期限超過" : "未払い",
                }))}
              />
              <AlertRow
                icon={CalendarClock}
                tone="amber"
                label="トライアル期限が7日以内"
                empty="該当なし"
                items={metrics.trialEndingSoon.map(({ c, days }) => ({
                  id: c.id,
                  title: c.name,
                  hint: days < 0 ? `期限切れ ${-days}日` : days === 0 ? "本日期限" : `あと${days}日`,
                }))}
              />
              <AlertRow
                icon={Clock}
                tone="amber"
                label="通話分が上限の80%超"
                empty="該当なし"
                items={metrics.nearLimit.map(({ c, ratio }) => ({
                  id: c.id,
                  title: c.name,
                  hint: `${Math.round(ratio * 100)}% (${c.minutesThisMonth}/${c.maxMinutesPerMonth}分)`,
                }))}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-gray-500" />今月の通話使用量 上位
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.topUsage.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-gray-400">
                今月の通話実績はまだありません
              </p>
            ) : (
              <div className="divide-y divide-gray-100">
                {metrics.topUsage.map((c, i) => {
                  const ratio =
                    c.maxMinutesPerMonth > 0
                      ? Math.min((c.minutesThisMonth / c.maxMinutesPerMonth) * 100, 100)
                      : 0;
                  return (
                    <Link
                      key={c.id}
                      href={`/admin/companies/${c.id}`}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 sm:px-6"
                    >
                      <span className="w-5 text-sm font-semibold text-gray-400">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full bg-purple-400"
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {c.minutesThisMonth}分
                        </p>
                        <p className="text-xs text-gray-400">{c.callsThisMonth}件</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}

interface AlertRowProps {
  icon: typeof AlertTriangle;
  tone: "red" | "amber" | "gray";
  label: string;
  empty: string;
  items: { id: string; title: string; hint: string }[];
}

const toneStyles: Record<AlertRowProps["tone"], { bg: string; text: string; badge: "destructive" | "warning" | "secondary" }> = {
  red:   { bg: "bg-red-50",   text: "text-red-600",   badge: "destructive" },
  amber: { bg: "bg-amber-50", text: "text-amber-600", badge: "warning" },
  gray:  { bg: "bg-gray-100", text: "text-gray-500",  badge: "secondary" },
};

function AlertRow({ icon: Icon, tone, label, empty, items }: AlertRowProps) {
  const s = toneStyles[tone];
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${s.bg}`}>
            <Icon className={`h-3.5 w-3.5 ${s.text}`} />
          </span>
          <span className="text-sm text-gray-700">{label}</span>
        </div>
        <span className="text-xs font-medium text-gray-400">{items.length}件</span>
      </div>
      {items.length === 0 ? (
        <p className="pl-8 text-xs text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1 pl-8">
          {items.slice(0, 4).map((it) => (
            <li key={it.id}>
              <Link
                href={`/admin/companies/${it.id}`}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-gray-50"
              >
                <span className="truncate text-gray-700">{it.title}</span>
                <Badge variant={s.badge}>{it.hint}</Badge>
              </Link>
            </li>
          ))}
          {items.length > 4 && (
            <li className="pl-2 pt-1 text-xs text-gray-400">他 {items.length - 4} 件</li>
          )}
        </ul>
      )}
    </div>
  );
}
