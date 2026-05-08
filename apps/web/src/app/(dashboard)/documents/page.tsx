"use client";

import { useState } from "react";
import { Upload, FileText, Link, AlignLeft, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockDocuments } from "@/mock/data";

const typeIcons: Record<string, React.ReactNode> = {
  PDF: <FileText className="w-5 h-5 text-red-500" />,
  URL: <Link className="w-5 h-5 text-blue-500" />,
  TEXT: <AlignLeft className="w-5 h-5 text-green-500" />,
};

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary"; icon: React.ReactNode }> = {
  AVAILABLE: { label: "利用可能", variant: "success", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  PROCESSING: { label: "処理中", variant: "warning", icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
  ERROR: { label: "エラー", variant: "destructive", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

export default function DocumentsPage() {
  const [documents] = useState(mockDocuments);

  return (
    <>
      <Header title="参考資料管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">登録資料: {documents.length} 件</p>
          <div className="flex gap-2">
            <Button variant="outline">
              <Link className="w-4 h-4 mr-2" />
              URLを追加
            </Button>
            <Button variant="outline">
              <AlignLeft className="w-4 h-4 mr-2" />
              テキストを追加
            </Button>
            <Button>
              <Upload className="w-4 h-4 mr-2" />
              PDFをアップロード
            </Button>
          </div>
        </div>

        <div className="grid gap-4">
          {documents.map((doc) => {
            const status = statusConfig[doc.status];
            return (
              <Card key={doc.id}>
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center">
                        {typeIcons[doc.type]}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">{doc.name}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{doc.type}</Badge>
                          <Badge variant={status.variant} className="flex items-center gap-1">
                            {status.icon}
                            {status.label}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-8 text-right">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">使用フロー</p>
                        <p className="text-sm text-gray-700">
                          {doc.usedInFlows.length > 0 ? doc.usedInFlows.join(", ") : "未使用"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 mb-1">最終更新</p>
                        <p className="text-sm text-gray-700">{doc.updatedAt}</p>
                      </div>
                      <Button variant="outline" size="sm">
                        詳細
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
