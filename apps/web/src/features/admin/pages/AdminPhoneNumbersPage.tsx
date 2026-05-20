"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/shared/layout/header";
import { AdminPhoneNumberStock } from "@/features/admin/components/AdminPhoneNumberStock";
import { adminApi, type AdminCompany } from "@/features/admin/api/admin-api";

/**
 * 運営管理者向けの電話番号管理ページ。
 * NTT CPaaS 番号の在庫登録、未割当ストック、会社への割当、追加リクエスト対応をここに集約する。
 */
export function AdminPhoneNumbersPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    try {
      const res = await adminApi.listCompanies();
      setCompanies(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return (
    <>
      <Header title="電話番号管理" />
      <main className="flex-1 p-6 space-y-6">
        {loading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : (
          <AdminPhoneNumberStock companies={companies} />
        )}
      </main>
    </>
  );
}
