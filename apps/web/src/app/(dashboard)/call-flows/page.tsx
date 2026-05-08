"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, GitBranch, Clock, CheckCircle2, FileEdit, Trash2 } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateFlowModal } from "@/components/call-flows/CreateFlowModal";
import { callFlowsApi, type CallFlow } from "@/lib/api/call-flows";
import { getCompanyId } from "@/lib/get-company-id";

export default function CallFlowsPage() {
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchFlows = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await callFlowsApi.list(companyId);
      setFlows(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const handlePublish = async (id: string) => {
    try {
      const res = await callFlowsApi.update(id, { status: "PUBLISHED" });
      setFlows((prev) => prev.map((f) => f.id === id ? res.data : f));
    } catch {
      alert("公開に失敗しました");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`「${name}」を削除しますか？`)) return;
    try {
      await callFlowsApi.remove(id);
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch {
      alert("削除に失敗しました");
    }
  };

  const handleCreated = (flow: CallFlow) => {
    setFlows((prev) => [flow, ...prev]);
  };

  return (
    <>
      <Header title="対応フロー管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">登録フロー: {loading ? "—" : `${flows.length} 件`}</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled>
              <FileEdit className="w-4 h-4 mr-2" />テンプレートから作成
            </Button>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />新規フロー作成
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && flows.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">コールフローがまだ登録されていません</p>
        )}

        <div className="grid gap-4">
          {flows.map((flow) => (
            <Card key={flow.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
                      <GitBranch className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-gray-900">{flow.name}</h3>
                        <Badge variant={flow.status === "PUBLISHED" ? "success" : "secondary"}>
                          {flow.status === "PUBLISHED" ? "公開中" : "下書き"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{flow.description ?? "説明なし"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">割当電話番号</p>
                      <p className="text-sm font-medium text-gray-700">{flow._count?.phoneNumbers ?? 0} 番号</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1 flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" /> 最終更新
                      </p>
                      <p className="text-sm font-medium text-gray-700">
                        {new Date(flow.updatedAt).toLocaleDateString("ja-JP")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/call-flows/${flow.id}`}>
                        <Button variant="outline" size="sm">編集</Button>
                      </Link>
                      {flow.status === "DRAFT" && (
                        <Button size="sm" onClick={() => handlePublish(flow.id)}>
                          <CheckCircle2 className="w-4 h-4 mr-1" />公開
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(flow.id, flow.name)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {showCreateModal && (
        <CreateFlowModal
          companyId={getCompanyId()}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
