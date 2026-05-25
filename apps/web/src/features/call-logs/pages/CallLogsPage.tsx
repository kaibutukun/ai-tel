"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { callSessionsApi, type CallSession } from "@/entities/call-session/api/call-sessions-api";
import { getCompanyId } from "@/shared/auth/company";

const resultConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "info" }> = {
  AI_RESOLVED: { label: "AI解決", variant: "success" },
  TRANSFERRED: { label: "人間転送", variant: "warning" },
  CALLBACK_REQUESTED: { label: "折り返し", variant: "info" },
  NO_ANSWER: { label: "未応答", variant: "destructive" },
  VOICEMAIL: { label: "留守録", variant: "secondary" },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function CallLogsPage() {
  const [logs, setLogs] = useState<CallSession[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await callSessionsApi.list(companyId);
      setLogs(res.data);
      setTotal(res.meta.total);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <>
      <Header title="通話ログ" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">直近の通話: {loading ? "—" : `${total} 件`}</p>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["通話日時", "発信者番号", "対応フロー", "対応結果", "通話時間", "詳細"].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">通話ログがありません</td></tr>
                )}
                {logs.map((log) => {
                  const result = resultConfig[log.result];
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">{formatDate(log.startedAt)}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-900">{log.callerNumber ?? "非通知"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{log.callFlow?.name ?? "—"}</td>
                      <td className="px-4 py-4"><Badge variant={result.variant}>{result.label}</Badge></td>
                      <td className="px-4 py-4 text-sm text-gray-600">{formatDuration(log.durationSeconds)}</td>
                      <td className="px-4 py-4">
                        <Link href={`/call-logs/${log.id}`}>
                          <Button variant="outline" size="sm">詳細</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
