"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { faqsApi, type Faq } from "@/lib/api/faqs";

interface FaqModalProps {
  companyId: string;
  faq?: Faq | null;
  onClose: () => void;
  onSaved: () => void;
}

export function FaqModal({ companyId, faq, onClose, onSaved }: FaqModalProps) {
  const isEdit = !!faq;
  const [category, setCategory] = useState(faq?.category ?? "");
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [priority, setPriority] = useState(String(faq?.priority ?? 0));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (faq) {
      setCategory(faq.category ?? "");
      setQuestion(faq.question);
      setAnswer(faq.answer);
      setPriority(String(faq.priority));
    }
  }, [faq]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isEdit && faq) {
        await faqsApi.update(faq.id, {
          category: category || undefined,
          question,
          answer,
          priority: Number(priority),
        });
      } else {
        await faqsApi.create({
          companyId,
          category: category || undefined,
          question,
          answer,
          priority: Number(priority),
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
      <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            {isEdit ? "FAQ編集" : "FAQ追加"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="faq-category">カテゴリ</Label>
            <Input
              id="faq-category"
              placeholder="例：予約、営業時間"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="faq-question">質問 *</Label>
            <Input
              id="faq-question"
              placeholder="よくある質問を入力してください"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="faq-answer">回答 *</Label>
            <Textarea
              id="faq-answer"
              placeholder="回答を入力してください"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              required
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="faq-priority">優先度（数値が小さいほど上位）</Label>
            <Input
              id="faq-priority"
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : isEdit ? "更新" : "追加"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
