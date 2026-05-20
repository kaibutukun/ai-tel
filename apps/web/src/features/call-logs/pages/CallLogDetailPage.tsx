"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, User, Play, MessageSquare, FileText, BookOpen } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { callSessionsApi, type CallSessionDetail } from "@/entities/call-session/api/call-sessions-api";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP");
}

interface CallLogDetailPageProps {
  id: string;
}

export function CallLogDetailPage({ id }: CallLogDetailPageProps) {
  const [log, setLog] = useState<CallSessionDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callSessionsApi.get(id)
      .then((res) => setLog(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <>
        <Header title="通話ログ詳細" />
        <main className="flex-1 p-6"><p className="text-sm text-gray-400">読み込み中...</p></main>
      </>
    );
  }

  if (!log) {
    return (
      <>
        <Header title="通話ログ詳細" />
        <main className="flex-1 p-6">
          <Link href="/call-logs"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />戻る</Button></Link>
          <p className="text-sm text-red-500 mt-4">通話ログが見つかりませんでした</p>
        </main>
      </>
    );
  }

  const summary = log.summaries[0];

  return (
    <>
      <Header title="通話ログ詳細" />
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        <Link href="/call-logs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />通話ログ一覧に戻る
          </Button>
        </Link>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "通話日時", value: formatDate(log.startedAt) },
            { label: "発信者番号", value: log.callerNumber ?? "非通知" },
            { label: "通話時間", value: formatDuration(log.durationSeconds) },
            { label: "用件カテゴリ", value: log.category ?? "—" },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-400 mb-1">{label}</p>
                <p className="text-sm font-medium text-gray-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isAi ? "bg-blue-100" : "bg-blue-600"}`}
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
                            className={`mt-1 text-[10px] ${isAi ? "text-gray-500" : "text-blue-100 text-right"}`}
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
                <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="w-5 h-5" />AI要約</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-700 leading-relaxed">{summary.summary}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" />使用したFAQ</CardTitle></CardHeader>
              <CardContent>
                {log.sessionFaqs.length > 0 ? (
                  <div className="space-y-2">
                    {log.sessionFaqs.map((sf, i) => (
                      <div key={i} className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md">{sf.faq.question}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">使用なし</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />使用した参考資料</CardTitle></CardHeader>
              <CardContent>
                {log.sessionDocs.length > 0 ? (
                  <div className="space-y-2">
                    {log.sessionDocs.map((sd, i) => (
                      <div key={i} className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md">{sd.document.name}</div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">使用なし</p>
                )}
              </CardContent>
            </Card>

            {log.recordingUrl && (
              <Card>
                <CardHeader><CardTitle className="flex items-center gap-2"><Play className="w-5 h-5" />録音</CardTitle></CardHeader>
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
