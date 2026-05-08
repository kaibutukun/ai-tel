"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Globe, AlignLeft, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { documentsApi, type Document } from "@/lib/api/documents";
import { getCompanyId } from "@/lib/get-company-id";

const typeIcons: Record<string, React.ReactNode> = {
  PDF: <FileText className="w-5 h-5 text-red-500" />,
  URL: <Globe className="w-5 h-5 text-blue-500" />,
  TEXT: <AlignLeft className="w-5 h-5 text-green-500" />,
};

const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive"; icon: React.ReactNode }> = {
  AVAILABLE: { label: "利用可能", variant: "success", icon: <CheckCircle className="w-3.5 h-3.5" /> },
  PROCESSING: { label: "処理中", variant: "warning", icon: <RefreshCw className="w-3.5 h-3.5 animate-spin" /> },
  ERROR: { label: "エラー", variant: "destructive", icon: <AlertCircle className="w-3.5 h-3.5" /> },
};

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await documentsApi.list(companyId);
      setDocuments(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  return (
    <>
      <Header title="参考資料管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録資料: {loading ? "—" : `${documents.length} 件`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline">
              <Globe className="w-4 h-4 mr-2" />URLを追加
            </Button>
            <Button variant="outline">
              <AlignLeft className="w-4 h-4 mr-2" />テキストを追加
            </Button>
            <Button>
              <Upload className="w-4 h-4 mr-2" />PDFをアップロード
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && documents.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">参考資料がまだ登録されていません</p>
        )}

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
                        <p className="text-sm text-gray-700">
                          {new Date(doc.updatedAt).toLocaleDateString("ja-JP")}
                        </p>
                      </div>
                      <Button variant="outline" size="sm">詳細</Button>
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
