import Link from "next/link";
import { ArrowLeft, Bot, User, Play, MessageSquare, FileText, BookOpen } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockCallLogDetail } from "@/mock/data";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

export default function CallLogDetailPage({ params }: { params: { id: string } }) {
  const log = mockCallLogDetail;

  return (
    <>
      <Header title="通話ログ詳細" />
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        <Link href="/call-logs">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            通話ログ一覧に戻る
          </Button>
        </Link>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "通話日時", value: log.startedAt },
            { label: "発信者番号", value: log.callerNumber },
            { label: "通話時間", value: formatDuration(log.durationSeconds) },
            { label: "用件カテゴリ", value: log.category },
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
                <MessageSquare className="w-5 h-5" />
                文字起こし
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-72 overflow-y-auto pr-2">
                {log.transcripts.map((t, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${t.speaker === "AI" ? "" : "flex-row-reverse"}`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        t.speaker === "AI" ? "bg-blue-100" : "bg-gray-100"
                      }`}
                    >
                      {t.speaker === "AI" ? (
                        <Bot className="w-4 h-4 text-blue-600" />
                      ) : (
                        <User className="w-4 h-4 text-gray-600" />
                      )}
                    </div>
                    <div
                      className={`flex-1 rounded-lg px-3 py-2 text-sm ${
                        t.speaker === "AI"
                          ? "bg-blue-50 text-gray-800"
                          : "bg-gray-50 text-gray-800 text-right"
                      }`}
                    >
                      <p>{t.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{t.timestamp}秒</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  AI要約
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 leading-relaxed">{log.summary}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  使用したFAQ
                </CardTitle>
              </CardHeader>
              <CardContent>
                {log.usedFaqs.length > 0 ? (
                  <div className="space-y-2">
                    {log.usedFaqs.map((faq) => (
                      <div
                        key={faq}
                        className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md"
                      >
                        {faq}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">使用なし</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  使用した参考資料
                </CardTitle>
              </CardHeader>
              <CardContent>
                {log.usedDocuments.length > 0 ? (
                  <div className="space-y-2">
                    {log.usedDocuments.map((doc) => (
                      <div key={doc} className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-md">
                        {doc}
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
                    <Play className="w-5 h-5" />
                    録音
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" className="w-full">
                    <Play className="w-4 h-4 mr-2" />
                    録音を再生
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
