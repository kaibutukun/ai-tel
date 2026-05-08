import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mockCallFlows } from "@/mock/data";

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
  const flow = mockCallFlows.find((f) => f.id === params.id) || mockCallFlows[0];

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3 flex-shrink-0">
        <Link href="/call-flows">
          <Button variant="ghost" size="sm" className="h-8">
            <ArrowLeft className="w-4 h-4 mr-1" />
            フロー一覧
          </Button>
        </Link>
        <div className="w-px h-5 bg-gray-200" />
        <span className="text-sm font-medium text-gray-600">{flow.name}</span>
      </div>
      <div className="flex-1 flex overflow-hidden">
        <FlowEditor flowName={flow.name} flowStatus={flow.status} />
      </div>
    </div>
  );
}
