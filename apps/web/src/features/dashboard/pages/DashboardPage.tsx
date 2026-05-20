"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone, CheckCircle, ArrowRightLeft, PhoneCall, AlertCircle, TrendingUp,
} from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { dashboardApi, type DashboardStats } from "@/features/dashboard/api/dashboard-api";
import { getCompanyId } from "@/shared/auth/company";

export function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await dashboardApi.getStats(companyId);
      setStats(res.data);
    } catch {
      // 接続失敗時は空データを表示
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const today = stats?.todayStats ?? { totalCalls: 0, aiResolved: 0, transferred: 0, callbackRequested: 0, unhandled: 0 };
  const aiRate = today.totalCalls > 0 ? Math.round((today.aiResolved / today.totalCalls) * 100) : 0;
  const weekly = stats?.weeklyCallData ?? [];
  const topInquiries = stats?.topInquiries ?? [];
  const unanswered = stats?.unansweredQuestions ?? [];

  const statCards = [
    { label: "今日の着信数", value: today.totalCalls, icon: Phone, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "AI対応完了", value: today.aiResolved, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
    { label: "人間転送", value: today.transferred, icon: ArrowRightLeft, color: "text-orange-600", bg: "bg-orange-50" },
    { label: "折り返し依頼", value: today.callbackRequested, icon: PhoneCall, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "未対応", value: today.unhandled, icon: AlertCircle, color: "text-red-600", bg: "bg-red-50" },
  ];

  return (
    <>
      <Header title="ダッシュボード" />
      <main className="flex-1 p-6 space-y-6">
        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
                    <card.icon className={`w-4 h-4 ${card.color}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />今週の通話数推移
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekly.length > 0 ? (
                <>
                  <div className="flex items-end gap-3 h-40">
                    {weekly.map((d) => {
                      const maxCalls = Math.max(...weekly.map((x) => x.calls), 1);
                      return (
                        <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full flex flex-col justify-end" style={{ height: "120px" }}>
                            <div className="w-full bg-blue-100 rounded-t" style={{ height: `${(d.calls / maxCalls) * 100}%` }} />
                          </div>
                          <span className="text-xs text-gray-500">{d.day}</span>
                          <span className="text-xs font-medium text-gray-700">{d.calls}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                    <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-100" />着信数</div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 py-8 text-center">まだ通話データがありません</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>AI対応率</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-32 h-32">
                  <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#2563eb" strokeWidth="3"
                      strokeDasharray={`${aiRate} ${100 - aiRate}`} strokeLinecap="round" />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-gray-900">{aiRate}%</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">{today.aiResolved} / {today.totalCalls} 件</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>よくある問い合わせ</CardTitle></CardHeader>
            <CardContent>
              {topInquiries.length > 0 ? (
                <div className="space-y-3">
                  {topInquiries.map((item, i) => {
                    const maxCount = topInquiries[0].count;
                    return (
                      <div key={item.category}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700">{i + 1}. {item.category}</span>
                          <span className="text-sm font-medium text-gray-900">{item.count}件</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">今日の通話データはまだありません</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-500" />AIが回答できなかった質問
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unanswered.length > 0 ? (
                <div className="space-y-2">
                  {unanswered.map((q) => (
                    <div key={q} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <AlertCircle className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-700">{q}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-4 text-center">未回答の質問はありません</p>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
