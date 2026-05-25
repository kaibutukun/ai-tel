"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Phone, PhoneCall, Building2 } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import {
  adminApi,
  type AdminCallSession,
  type AdminCompany,
} from "@/features/admin/api/admin-api";

const ALL_COMPANIES = "__all__";
const PAGE_SIZE = 30;

const resultConfig: Record<
  AdminCallSession["result"],
  { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "info" }
> = {
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
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminCallLogsPage() {
  const [logs, setLogs] = useState<AdminCallSession[]>([]);
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [companyId, setCompanyId] = useState<string>(ALL_COMPANIES);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  useEffect(() => {
    adminApi
      .listCompanies()
      .then((res) => setCompanies(res.data))
      .catch(() => {});
  }, []);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listCallSessions({
        page,
        limit: PAGE_SIZE,
        companyId: companyId === ALL_COMPANIES ? undefined : companyId,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
      });
      setLogs(res.data);
      setTotal(res.meta.total);
    } finally {
      setLoading(false);
    }
  }, [page, companyId, from, to]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setPage(1);
  }, [companyId, from, to]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const hasFilters = companyId !== ALL_COMPANIES || from !== "" || to !== "";

  const resetFilters = () => {
    setCompanyId(ALL_COMPANIES);
    setFrom("");
    setTo("");
  };

  return (
    <>
      <Header title="通話履歴（運営者）" />
      <main className="flex-1 p-6 space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_auto] gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="filter-company" className="text-xs text-gray-500">企業</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="filter-company">
                  <SelectValue placeholder="すべて" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_COMPANIES}>すべての企業</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-from" className="text-xs text-gray-500">開始日</Label>
              <Input
                id="filter-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to" className="text-xs text-gray-500">終了日</Label>
              <Input
                id="filter-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>
              リセット
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["通話日時", "企業", "発信者番号", "対応フロー", "対応結果", "通話時間", "詳細"].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                      通話ログがありません
                    </td>
                  </tr>
                )}
                {logs.map((log) => {
                  const result = resultConfig[log.result];
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                        {formatDate(log.startedAt)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-900">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />
                          {log.company?.name ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm text-gray-900">{log.callerNumber ?? "非通知"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">{log.callFlow?.name ?? "—"}</td>
                      <td className="px-4 py-4">
                        <Badge variant={result.variant}>{result.label}</Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-600">
                        {formatDuration(log.durationSeconds)}
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/call-logs/${log.id}`}>
                          <Button variant="outline" size="sm">
                            <PhoneCall className="w-3.5 h-3.5 mr-1.5" />詳細
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  全{total}件中 {(page - 1) * PAGE_SIZE + 1}〜
                  {Math.min(page * PAGE_SIZE, total)}件
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    前へ
                  </Button>
                  <span className="text-xs text-gray-500">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    次へ
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}
