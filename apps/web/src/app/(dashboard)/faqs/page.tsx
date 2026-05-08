"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { mockFaqs } from "@/mock/data";

export default function FaqsPage() {
  const [faqs, setFaqs] = useState(mockFaqs);
  const [search, setSearch] = useState("");

  const filtered = faqs.filter(
    (f) =>
      f.question.includes(search) ||
      f.answer.includes(search) ||
      (f.category || "").includes(search)
  );

  const toggleActive = (id: string) => {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f)));
  };

  const handleDelete = (id: string) => {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <>
      <Header title="FAQ管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="FAQを検索..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            FAQ追加
          </Button>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  カテゴリ
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  質問
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  回答
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  優先度
                </th>
                <th className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">
                  有効
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((faq) => (
                <tr key={faq.id} className={`hover:bg-gray-50 ${!faq.isActive ? "opacity-50" : ""}`}>
                  <td className="px-6 py-4">
                    <Badge variant="secondary">{faq.category}</Badge>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900 max-w-xs">{faq.question}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 max-w-sm truncate">{faq.answer}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-gray-600">{faq.priority}</span>
                  </td>
                  <td className="px-6 py-4">
                    <Switch
                      checked={faq.isActive}
                      onCheckedChange={() => toggleActive(faq.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon">
                        <Pencil className="w-4 h-4 text-gray-400" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(faq.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">FAQが見つかりませんでした</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
