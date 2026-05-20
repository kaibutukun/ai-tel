import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";
import type { CallLog } from "../model/types";

interface CallLogPanelProps {
  logs: CallLog[];
}

export function CallLogPanel({ logs }: CallLogPanelProps) {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-600" />
          <h2 className="text-sm font-semibold text-gray-900">通話ログ</h2>
        </div>
        <span className="text-xs text-gray-500">音声応答はスピーカーから再生されます</span>
      </div>
      <div className="h-[520px] overflow-y-auto p-5 space-y-3">
        {logs.map((log) => {
          if (log.kind === "user") {
            return (
              <div key={log.id} className="flex justify-end">
                <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-white shadow-sm">
                  <p className="whitespace-pre-wrap text-sm leading-6">{log.message}</p>
                  <p className="mt-1 text-right text-[10px] text-blue-100">
                    お客様 ・ {log.time}
                  </p>
                </div>
              </div>
            );
          }
          if (log.kind === "assistant") {
            return (
              <div key={log.id} className="flex justify-start">
                <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2 text-gray-900 shadow-sm">
                  <p className="whitespace-pre-wrap text-sm leading-6">{log.message}</p>
                  <p className="mt-1 text-[10px] text-gray-500">AI ・ {log.time}</p>
                </div>
              </div>
            );
          }
          const chipColor =
            log.kind === "error"
              ? "bg-red-50 text-red-700 border-red-100"
              : log.kind === "tool"
                ? "bg-amber-50 text-amber-800 border-amber-100"
                : "bg-gray-50 text-gray-600 border-gray-100";
          const chipLabel =
            log.kind === "error" ? "エラー" : log.kind === "tool" ? "ツール" : "システム";
          return (
            <div key={log.id} className="flex justify-center">
              <div className={`max-w-[85%] rounded-md border px-3 py-2 text-xs ${chipColor}`}>
                <p className="mb-0.5 text-[10px] opacity-70">
                  {chipLabel} ・ {log.time}
                </p>
                <p className="whitespace-pre-wrap leading-5">{log.message}</p>
              </div>
            </div>
          );
        })}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
