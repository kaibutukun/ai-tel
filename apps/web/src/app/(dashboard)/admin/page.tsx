import Link from "next/link";
import { Building2, TrendingUp, Phone, Clock, DollarSign } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { mockAdminCompanies } from "@/mock/data";

const planVariants: Record<string, "default" | "secondary" | "outline" | "info" | "success"> = {
  Trial: "secondary",
  Starter: "outline",
  Business: "info",
  Pro: "default",
  Enterprise: "success",
};

const billingVariants: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  PAID: "success",
  UNPAID: "destructive",
  OVERDUE: "warning",
  NONE: "secondary",
};

const billingLabels: Record<string, string> = {
  PAID: "支払済",
  UNPAID: "未払い",
  OVERDUE: "期限超過",
  NONE: "なし",
};

export default function AdminPage() {
  const totalMRR = mockAdminCompanies.reduce((sum, c) => sum + c.priceMonthly, 0);
  const activeCount = mockAdminCompanies.filter((c) => c.isActive).length;
  const totalCalls = mockAdminCompanies.reduce((sum, c) => sum + c.callsThisMonth, 0);
  const totalMinutes = mockAdminCompanies.reduce((sum, c) => sum + c.minutesThisMonth, 0);

  return (
    <>
      <Header title="管理者ダッシュボード" />
      <main className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "登録企業数", value: `${mockAdminCompanies.length}社`, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "今月MRR", value: `¥${totalMRR.toLocaleString()}`, icon: DollarSign, color: "text-green-600", bg: "bg-green-50" },
            { label: "今月の総通話数", value: `${totalCalls}件`, icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "今月の総通話時間", value: `${totalMinutes}分`, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              登録企業一覧
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["企業名", "プラン", "月額", "今月通話数", "通話時間", "電話番号数", "請求", "ステータス", ""].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider px-4 py-3"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {mockAdminCompanies.map((company) => (
                  <tr key={company.id} className={`hover:bg-gray-50 ${!company.isActive ? "opacity-50" : ""}`}>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-gray-900">{company.name}</p>
                      <p className="text-xs text-gray-400">{company.createdAt}〜</p>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={planVariants[company.plan] || "secondary"}>{company.plan}</Badge>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">
                      {company.priceMonthly > 0 ? `¥${company.priceMonthly.toLocaleString()}` : "無料"}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">{company.callsThisMonth}件</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{company.minutesThisMonth}分</td>
                    <td className="px-4 py-4 text-sm text-gray-700">{company.phoneNumbersCount}番号</td>
                    <td className="px-4 py-4">
                      <Badge variant={billingVariants[company.billingStatus] || "secondary"}>
                        {billingLabels[company.billingStatus] || company.billingStatus}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge variant={company.isActive ? "success" : "secondary"}>
                        {company.isActive ? "アクティブ" : "停止中"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Link href={`/admin/companies/${company.id}`}>
                        <Button variant="outline" size="sm">詳細</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
