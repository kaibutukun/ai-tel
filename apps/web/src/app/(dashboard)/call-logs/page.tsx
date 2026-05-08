"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone, Bot, User, PhoneCall } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockCallLogs } from "@/mock/data";

const resultConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "info" }> = {
  AI_RESOLVED: { label: "AI解決", variant: "success" },
  TRANSFERRED: { label: "人間転送", variant: "warning" },
  CALLBACK_REQUESTED: { label: "折り返し", variant: "info" },
  NO_ANSWER: { label: "未応答", variant: "destructive" },
  VOICEMAIL: { label: "留守録", variant: "secondary" },
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function CallLogsPage() {
  const [logs] = useState(mockCallLogs);

  return (
    <>
      <Header title="通話ログ" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">直近の通話: {logs.length} 件</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["通話日時", "発信者番号", "対応フロー", "用件", "対応結果", "通話時間", "担当", "折り返し", "詳細"].map(
                  (h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => {
                const result = resultConfig[log.result];
                return (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {log.startedAt}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-gray-400" />
                        <span className="text-sm text-gray-900">{log.callerNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">{log.callFlow}</td>
                    <td className="px-4 py-4">
                      <Badge variant="secondary">{log.category}</Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={result.variant}>{result.label}</Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600">
                      {formatDuration(log.durationSeconds)}
                    </td>
                    <td className="px-4 py-4">
                      {log.isAiHandled ? (
                        <div className="flex items-center gap-1 text-blue-600 text-xs">
                          <Bot className="w-3.5 h-3.5" /> AI
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-orange-600 text-xs">
                          <User className="w-3.5 h-3.5" /> 人間
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      {log.callbackNeeded ? (
                        <div className="flex items-center gap-1 text-purple-600 text-xs">
                          <PhoneCall className="w-3.5 h-3.5" /> 要折返
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/call-logs/${log.id}`}>
                        <Button variant="outline" size="sm">
                          詳細
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
