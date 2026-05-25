"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, User, Play, MessageSquare, BookOpen, ClipboardList, Building2 } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { adminApi, type AdminCallSessionDetail } from "@/features/admin/api/admin-api";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP");
}

function extractCollectedEntries(data: unknown): { key: string; value: string }[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  return Object.entries(data as Record<string, unknown>)
    .map(([key, value]) => ({
      key,
      value: value == null ? "" : String(value).trim(),
    }))
    .filter((entry) => entry.value.length > 0);
}

const resultLabels: Record<AdminCallSessionDetail["result"], string> = {
  AI_RESOLVED: "AI解決",
  TRANSFERRED: "人間転送",
  CALLBACK_REQUESTED: "折り返し",
  NO_ANSWER: "未応答",
  VOICEMAIL: "留守録",
};

interface AdminCallLogDetailPageProps {
  id: string;
}

export function AdminCallLogDetailPage({ id }: AdminCallLogDetailPageProps) {
  const [log, setLog] = useState<AdminCallSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .getCallSession(id)
      .then((res) => setLog(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <>
        <Header title="通話履歴 詳細" />
        <main className="flex-1 w-full p-4 sm:p-6">
          <p className="text-sm text-gray-400">読み込み中...</p>
        </main>
      </>
    );
  }

  if (!log) {
    return (
      <>
        <Header title="通話履歴 詳細" />
        <main className="flex-1 w-full p-4 sm:p-6">
          <Link href="/admin/call-logs">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />戻る
            </Button>
          </Link>
          <p className="text-sm text-red-500 mt-4">通話ログが見つかりませんでした</p>
        </main>
      </>
    );
  }

  const summary = log.summaries[0];
  const collectedEntries = extractCollectedEntries(summary?.extractedData);

  return (
    <>
      <Header title="通話履歴 詳細" />
      <main className="flex-1 w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Link href="/admin/call-logs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />通話履歴一覧に戻る
          </Button>
        </Link>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />企業
              </p>
              {log.company ? (
                <Link
                  href={`/admin/companies/${log.company.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {log.company.name}
                </Link>
              ) : (
                <p className="text-sm text-gray-400">—</p>
              )}
            </CardContent>
          </Card>
          {[
            { label: "通話日時", value: formatDate(log.startedAt) },
            { label: "発信者番号", value: log.callerNumber ?? "非通知" },
            { label: "通話時間", value: formatDuration(log.durationSeconds) },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-sm font-medium text-gray-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm sm:gap-3">
          <Badge variant="outline">{resultLabels[log.result]}</Badge>
          {log.callFlow && (
            <span className="text-gray-600">フロー: {log.callFlow.name}</span>
          )}
          {log.phoneNumber && (
            <span className="text-gray-600">
              受信番号: {log.phoneNumber.displayName ?? log.phoneNumber.number}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />通話ログ
              </CardTitle>
            </CardHeader>
            <CardContent>
              {log.transcripts.length > 0 ? (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
                  {log.transcripts.map((t, i) => {
                    const isAi = t.speaker === "AI";
                    const ts = `${t.timestamp.toFixed(1)}秒`;
                    return (
                      <div
                        key={i}
                        className={`flex items-end gap-2 ${isAi ? "" : "flex-row-reverse"}`}
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isAi ? "bg-blue-100" : "bg-blue-600"
                          }`}
                        >
                          {isAi ? (
                            <Bot className="w-4 h-4 text-blue-600" />
                          ) : (
                            <User className="w-4 h-4 text-white" />
                          )}
                        </div>
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                            isAi
                              ? "rounded-tl-sm bg-gray-100 text-gray-900"
                              : "rounded-tr-sm bg-blue-600 text-white"
                          }`}
                        >
                          <p className="whitespace-pre-wrap leading-6">{t.content}</p>
                          <p
                            className={`mt-1 text-[10px] ${
                              isAi ? "text-gray-500" : "text-blue-100 text-right"
                            }`}
                          >
                            {isAi ? "AI" : "お客様"} ・ {ts}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-400">文字起こしデータがありません</p>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {summary && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Bot className="w-5 h-5" />AI要約
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
                </CardContent>
              </Card>
            )}

            {collectedEntries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="w-5 h-5" />収集した情報
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-2">
                    {collectedEntries.map(({ key, value }) => (
                      <div
                        key={key}
                        className="grid grid-cols-[7rem_1fr] gap-2 text-sm bg-gray-50 px-3 py-2 rounded-md"
                      >
                        <dt className="text-gray-500">{key}</dt>
                        <dd className="text-gray-900 whitespace-pre-wrap break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />使用したFAQ
                </CardTitle>
              </CardHeader>
              <CardContent>
                {log.sessionFaqs.length > 0 ? (
                  <div className="space-y-2">
                    {log.sessionFaqs.map((sf, i) => (
                      <div
                        key={i}
                        className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md"
                      >
                        {sf.faq.question}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">使用なし</p>
                )}
              </CardContent>
            </Card>

            {log.recordingUrl && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Play className="w-5 h-5" />録音
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    <Play className="w-4 h-4 mr-2" />録音を再生
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
