"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { documentsApi } from "@/lib/api/documents";

type DocumentType = "PDF" | "URL" | "TEXT";

interface DocumentModalProps {
  companyId: string;
  initialType: DocumentType;
  onClose: () => void;
  onSaved: () => void;
}

const typeLabels: Record<DocumentType, string> = {
  PDF: "PDF資料",
  URL: "URL資料",
  TEXT: "テキスト資料",
};

export function DocumentModal({
  companyId,
  initialType,
  onClose,
  onSaved,
}: DocumentModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (initialType === "PDF" && file) {
        await documentsApi.uploadPdf({
          companyId,
          name: name || file.name,
          file,
        });
      } else {
        await documentsApi.create({
          companyId,
          name,
          type: initialType,
          url: url || undefined,
          content: content || undefined,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-lg w-full max-w-xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {typeLabels[initialType]}を追加
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="document-name">資料名 *</Label>
            <Input
              id="document-name"
              placeholder="例：営業時間と料金表"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {initialType === "PDF" && (
            <div className="space-y-1.5">
              <Label htmlFor="document-file">PDFファイル *</Label>
              <Input
                id="document-file"
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>
          )}

          {initialType === "URL" && (
            <div className="space-y-1.5">
              <Label htmlFor="document-url">URL *</Label>
              <Input
                id="document-url"
                type="url"
                placeholder="https://example.com/guide"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
              />
            </div>
          )}

          {initialType === "TEXT" && (
            <div className="space-y-1.5">
              <Label htmlFor="document-content">本文 *</Label>
              <Textarea
                id="document-content"
                placeholder="AI回答に使う内容を入力してください"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                rows={8}
              />
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : "追加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
