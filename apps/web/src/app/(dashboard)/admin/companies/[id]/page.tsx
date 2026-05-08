import Link from "next/link";
import { ArrowLeft, Building2, Phone, Clock, CreditCard, FileText } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { mockAdminCompanies } from "@/mock/data";

const invoiceHistory = [
  { month: "2024-03", total: 29800, status: "PAID" },
  { month: "2024-02", total: 29800, status: "PAID" },
  { month: "2024-01", total: 29800, status: "PAID" },
];

export default function AdminCompanyDetailPage({ params }: { params: { id: string } }) {
  const company = mockAdminCompanies.find((c) => c.id === params.id) || mockAdminCompanies[0];

  return (
    <>
      <Header title="企業詳細" />
      <main className="flex-1 p-6 space-y-6 max-w-5xl mx-auto">
        <Link href="/admin">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            管理者ダッシュボードに戻る
          </Button>
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{company.name}</h2>
              <p className="text-sm text-gray-500">登録日: {company.createdAt}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">
              アカウント停止
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "プラン", value: company.plan, icon: CreditCard },
            { label: "今月通話数", value: `${company.callsThisMonth}件`, icon: Phone },
            { label: "今月通話時間", value: `${company.minutesThisMonth}分`, icon: Clock },
            { label: "電話番号数", value: `${company.phoneNumbersCount}番号`, icon: Phone },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-gray-400" />
                  <p className="text-xs text-gray-400">{label}</p>
                </div>
                <p className="text-lg font-semibold text-gray-900">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                契約・請求情報
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">プラン</span>
                <Badge>{company.plan}</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">月額料金</span>
                <span className="text-sm font-medium">
                  {company.priceMonthly > 0 ? `¥${company.priceMonthly.toLocaleString()}` : "無料"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-500">請求ステータス</span>
                <Badge variant={company.billingStatus === "PAID" ? "success" : "destructive"}>
                  {company.billingStatus === "PAID" ? "支払済" : company.billingStatus}
                </Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">アカウント状態</span>
                <Badge variant={company.isActive ? "success" : "secondary"}>
                  {company.isActive ? "アクティブ" : "停止中"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                請求履歴
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {invoiceHistory.map((inv) => (
                  <div
                    key={inv.month}
                    className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                  >
                    <span className="text-sm text-gray-700">{inv.month}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">¥{inv.total.toLocaleString()}</span>
                      <Badge variant="success">支払済</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>管理メモ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                defaultValue="2024年1月から契約。安定利用中。問い合わせ対応は田中担当。"
                rows={4}
                placeholder="企業に関するメモを入力..."
              />
              <Button size="sm">メモを保存</Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
