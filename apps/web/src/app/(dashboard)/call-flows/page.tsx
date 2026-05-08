import Link from "next/link";
import { Plus, GitBranch, Clock, CheckCircle2, FileEdit } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockCallFlows } from "@/mock/data";

export default function CallFlowsPage() {
  return (
    <>
      <Header title="対応フロー管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">登録フロー: {mockCallFlows.length} 件</p>
          <div className="flex gap-2">
            <Button variant="outline">
              <FileEdit className="w-4 h-4 mr-2" />
              テンプレートから作成
            </Button>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              新規フロー作成
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {mockCallFlows.map((flow) => (
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
                      <p className="text-sm text-gray-500">{flow.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">ステップ数</p>
                      <p className="text-sm font-medium text-gray-700">{flow.stepsCount} ステップ</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1 flex items-center justify-end gap-1">
                        <Clock className="w-3 h-3" /> 最終更新
                      </p>
                      <p className="text-sm font-medium text-gray-700">{flow.updatedAt}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/call-flows/${flow.id}`}>
                        <Button variant="outline" size="sm">
                          編集
                        </Button>
                      </Link>
                      {flow.status === "DRAFT" && (
                        <Button size="sm">
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          公開
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </>
  );
}
