"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { Textarea } from "@/shared/ui/textarea";
import { faqsApi, type Faq } from "@/entities/faq/api/faqs-api";
import { FAQ_CATEGORIES } from "@/features/faqs/model/constants";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (faq) {
      setCategory(faq.category ?? "");
      setQuestion(faq.question);
      setAnswer(faq.answer);
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
        });
      } else {
        await faqsApi.create({
          companyId,
          category: category || undefined,
          question,
          answer,
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
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="faq-category">
                <SelectValue placeholder="カテゴリを選択" />
              </SelectTrigger>
              <SelectContent>
                {FAQ_CATEGORIES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
