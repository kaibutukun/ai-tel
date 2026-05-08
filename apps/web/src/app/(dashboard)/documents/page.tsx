"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Globe, AlignLeft, RefreshCw, AlertCircle, CheckCircle } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { DocumentModal } from "@/components/documents/DocumentModal";
import { aiApi, type AiSource } from "@/lib/api/ai";
import { documentsApi, type Document } from "@/lib/api/documents";
import { getCompanyId } from "@/lib/get-company-id";

type DocumentType = "PDF" | "URL" | "TEXT";

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
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [modalType, setModalType] = useState<DocumentType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<AiSource[]>([]);
  const [answering, setAnswering] = useState(false);

  const fetchDocuments = useCallback(async () => {
    const id = getCompanyId();
    setCompanyId(id);
    if (!id) {
      setLoading(false);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await documentsApi.list(id);
      setDocuments(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "資料の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleDelete = async (id: string) => {
    if (!window.confirm("この資料を削除しますか？")) return;
    try {
      await documentsApi.remove(id);
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  const handleAnswer = async () => {
    if (!companyId || !question.trim()) return;
    setAnswering(true);
    setAnswer(null);
    setSources([]);
    setError(null);

    try {
      const res = await aiApi.answer({ companyId, question });
      setAnswer(res.data.answer);
      setSources(res.data.sources);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI回答の生成に失敗しました");
    } finally {
      setAnswering(false);
    }
  };

  return (
    <>
      <Header title="参考資料管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録資料: {loading ? "—" : `${documents.length} 件`}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModalType("URL")}>
              <Globe className="w-4 h-4 mr-2" />URLを追加
            </Button>
            <Button variant="outline" onClick={() => setModalType("TEXT")}>
              <AlignLeft className="w-4 h-4 mr-2" />テキストを追加
            </Button>
            <Button onClick={() => setModalType("PDF")}>
              <Upload className="w-4 h-4 mr-2" />PDFを登録
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">AI回答テスト</h2>
                <p className="text-xs text-gray-500 mt-1">
                  FAQ・参考資料・Bedrock Knowledge Baseを参照して回答します
                </p>
              </div>
              <Button onClick={handleAnswer} disabled={!question.trim() || answering}>
                {answering ? "生成中..." : "回答生成"}
              </Button>
            </div>
            <Textarea
              placeholder="例：予約のキャンセルはいつまで無料ですか？"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
            />
            {answer && (
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{answer}</p>
                {sources.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {sources.map((source, index) => (
                      <Badge key={`${source.type}-${source.id ?? index}`} variant="secondary">
                        {source.type}: {source.title}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
                      <Button variant="outline" size="sm" onClick={() => handleDelete(doc.id)}>
                        削除
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
      {companyId && modalType && (
        <DocumentModal
          companyId={companyId}
          initialType={modalType}
          onClose={() => setModalType(null)}
          onSaved={fetchDocuments}
        />
      )}
    </>
  );
}
