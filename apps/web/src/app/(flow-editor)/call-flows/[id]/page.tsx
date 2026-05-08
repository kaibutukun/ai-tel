"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callFlowsApi, type CallFlow } from "@/lib/api/call-flows";

const FlowEditor = dynamic(
  () => import("@/components/flow-editor/FlowEditor").then((m) => ({ default: m.FlowEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-400">エディターを読み込み中...</p>
        </div>
      </div>
    ),
  }
);

export default function FlowEditPage({ params }: { params: { id: string } }) {
  const [flow, setFlow] = useState<CallFlow | null>(null);

  useEffect(() => {
    callFlowsApi.get(params.id)
      .then((res) => setFlow(res.data))
      .catch(() => {});
  }, [params.id]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
        <Link href="/call-flows">
          <Button variant="ghost" size="sm" className="h-8">
            <ArrowLeft className="w-4 h-4 mr-1" />フロー一覧
          </Button>
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-sm font-medium text-gray-600">
          {flow?.name ?? "読み込み中..."}
        </span>
      </div>
      <div className="flex-1 flex overflow-hidden">
        {flow && (
          <FlowEditor flowName={flow.name} flowStatus={flow.status} />
        )}
      </div>
    </div>
  );
}
