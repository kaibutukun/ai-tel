"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { Header } from "@/shared/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { adminApi, type AdminCompany, type AdminInvitationInfo } from "@/features/admin/api/admin-api";
import { CreateCompanyModal } from "@/features/admin/components/CreateCompanyModal";
import { InvitationLinkDialog } from "@/features/admin/components/InvitationLinkDialog";

const planVariants: Record<string, "default" | "secondary" | "outline" | "info" | "success"> = {
  TRIAL: "secondary",
  PAID: "success",
};

const planLabels: Record<string, string> = {
  TRIAL: "無料体験",
  PAID: "有料会員",
};

export function AdminCompaniesPage() {
  const [companies, setCompanies] = useState<AdminCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [invitationResult, setInvitationResult] = useState<{
    info: AdminInvitationInfo;
    companyName: string;
    adminEmail: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await adminApi.listCompanies();
      setCompanies(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <Header title="企業管理" />
      <main className="flex-1 w-full space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            企業数: {loading ? "—" : `${companies.length}社`}
          </p>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />企業を作成
          </Button>
        </div>

        {loading && <p className="text-sm text-gray-400">読み込み中...</p>}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />登録企業一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["企業名", "プラン", "月額", "今月通話", "請求", "状態", ""].map((h) => (
                    <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {companies.length === 0 && !loading && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">企業がありません</td></tr>
                )}
                {companies.map((company) => {
                  const planKey = company.planType ?? "";
                  const billingPaid = company.billingStatus === "PAID";
                  return (
                    <tr key={company.id} className={`hover:bg-gray-50 ${!company.isActive ? "opacity-50" : ""}`}>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-gray-900">{company.name}</p>
                        <p className="text-xs text-gray-400">{company.createdAt}〜</p>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={planVariants[planKey] ?? "secondary"}>
                          {planLabels[planKey] ?? company.plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {company.monthlyPrice > 0 ? `¥${company.monthlyPrice.toLocaleString()}` : "無料"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {company.minutesThisMonth}/{company.maxMinutesPerMonth}分
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={billingPaid ? "success" : "destructive"}>
                          {billingPaid ? "済" : "未"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={company.isActive ? "success" : "secondary"}>
                          {company.isActive ? "稼働中" : "停止中"}
                        </Badge>
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/admin/companies/${company.id}`}>
                          <Button variant="outline" size="sm">詳細</Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </main>

      {showCreate && (
        <CreateCompanyModal
          onClose={() => setShowCreate(false)}
          onCreated={({ invitation, companyName, adminEmail }) => {
            setShowCreate(false);
            setInvitationResult({ info: invitation, companyName, adminEmail });
            fetchData();
          }}
        />
      )}

      {invitationResult && (
        <InvitationLinkDialog
          title={`${invitationResult.companyName} を作成しました`}
          description={`${invitationResult.adminEmail} の管理者向け招待URLです。本人に渡してパスワードを設定してもらってください。`}
          url={invitationResult.info.url}
          expiresAt={invitationResult.info.expiresAt}
          onClose={() => setInvitationResult(null)}
        />
      )}
    </>
  );
}
