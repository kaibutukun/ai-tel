"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FaqModal } from "@/components/faqs/FaqModal";
import { faqsApi, type Faq } from "@/lib/api/faqs";
import { getCompanyId } from "@/lib/get-company-id";

export default function FaqsPage() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState<Faq | null>(null);

  const fetchFaqs = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await faqsApi.list(companyId);
      setFaqs(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFaqs(); }, [fetchFaqs]);

  const toggleActive = async (id: string, current: boolean) => {
    try {
      const res = await faqsApi.update(id, { isActive: !current });
      setFaqs((prev) => prev.map((f) => f.id === id ? res.data : f));
    } catch {
      alert("更新に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("このFAQを削除しますか？")) return;
    try {
      await faqsApi.remove(id);
      setFaqs((prev) => prev.filter((f) => f.id !== id));
    } catch {
      alert("削除に失敗しました");
    }
  };

  const openAdd = () => { setEditingFaq(null); setModalOpen(true); };
  const openEdit = (faq: Faq) => { setEditingFaq(faq); setModalOpen(true); };
  const closeModal = () => { setModalOpen(false); setEditingFaq(null); };

  const filtered = faqs.filter(
    (f) =>
      f.question.includes(search) ||
      f.answer.includes(search) ||
      (f.category ?? "").includes(search)
  );

  return (
    <>
      <Header title="FAQ管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="FAQを検索..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />FAQ追加
          </Button>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["カテゴリ", "質問", "回答", "有効", ""].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-6 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((faq) => (
                  <tr key={faq.id} className={`hover:bg-gray-50 ${!faq.isActive ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4">
                      <Badge variant="secondary">{faq.category ?? "未分類"}</Badge>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900 max-w-xs">{faq.question}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-500 max-w-sm truncate">{faq.answer}</p>
                    </td>
                    <td className="px-6 py-4">
                      <Switch checked={faq.isActive} onCheckedChange={() => toggleActive(faq.id, faq.isActive)} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(faq)}>
                          <Pencil className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(faq.id)}>
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
                <p className="text-sm">{search ? "FAQが見つかりませんでした" : "FAQがまだ登録されていません"}</p>
              </div>
            )}
          </div>
        )}
      </main>

      {modalOpen && (
        <FaqModal
          companyId={getCompanyId()}
          faq={editingFaq}
          onClose={closeModal}
          onSaved={fetchFaqs}
        />
      )}
    </>
  );
}
