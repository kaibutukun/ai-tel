"use client";

import { useEffect, useState } from "react";
import { Phone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminApi,
  type AdminCompany,
  type AdminPhoneNumber,
  type AdminPhoneNumberRequest,
} from "@/lib/api/admin";

interface AdminPhoneNumberStockProps {
  companies: AdminCompany[];
}

/**
 * 運営管理者用の電話番号在庫管理。
 * NTT CPaaS で取得した番号を未割当在庫として登録し、必要に応じて会社へ割り当てる。
 */
export function AdminPhoneNumberStock({ companies }: AdminPhoneNumberStockProps) {
  const [numbers, setNumbers] = useState<AdminPhoneNumber[]>([]);
  const [requests, setRequests] = useState<AdminPhoneNumberRequest[]>([]);
  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [providerNumberId, setProviderNumberId] = useState("");
  const [companyId, setCompanyId] = useState("stock");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [numbersRes, requestsRes] = await Promise.all([
        adminApi.listPhoneNumbers(),
        adminApi.listPhoneNumberRequests(),
      ]);
      setNumbers(numbersRes.data);
      setRequests(requestsRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await adminApi.createPhoneNumber({
        number,
        displayName: displayName || undefined,
        providerNumberId: providerNumberId || undefined,
        companyId: companyId === "stock" ? undefined : companyId,
      });
      setNumbers((prev) => [res.data, ...prev]);
      setNumber("");
      setDisplayName("");
      setProviderNumberId("");
      setCompanyId("stock");
    } catch (err) {
      alert(err instanceof Error ? err.message : "電話番号の登録に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async (id: string, nextCompanyId: string) => {
    try {
      const res = await adminApi.assignPhoneNumber(
        id,
        nextCompanyId === "stock" ? null : nextCompanyId
      );
      setNumbers((prev) => prev.map((n) => (n.id === id ? res.data : n)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "割当に失敗しました");
    }
  };

  const handleRequestStatus = async (
    id: string,
    status: AdminPhoneNumberRequest["status"]
  ) => {
    try {
      const res = await adminApi.updatePhoneNumberRequest(id, { status });
      setRequests((prev) => prev.map((r) => (r.id === id ? res.data : r)));
    } catch {
      alert("リクエスト更新に失敗しました");
    }
  };

  const pendingRequests = requests.filter((r) => r.status === "PENDING");

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />電話番号在庫
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreate} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_180px_auto]">
            <div className="space-y-1">
              <Label htmlFor="admin-phone-number">番号</Label>
              <Input
                id="admin-phone-number"
                placeholder="+15717175671"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-phone-name">表示名</Label>
              <Input
                id="admin-phone-name"
                placeholder="USテスト回線"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="admin-phone-provider-id">プロバイダ番号ID</Label>
              <Input
                id="admin-phone-provider-id"
                placeholder="NTT CPaaS / Infobip 側の番号ID"
                value={providerNumberId}
                onChange={(e) => setProviderNumberId(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>初期割当</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">未割当在庫</SelectItem>
                  {companies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving}>
                <Plus className="w-4 h-4 mr-2" />登録
              </Button>
            </div>
          </form>

          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">読み込み中...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr>
                    {["番号", "表示名", "状態", "割当先"].map((h) => (
                      <th key={h} className="text-left text-xs font-medium text-gray-500 px-3 py-2">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {numbers.map((phoneNumber) => (
                    <tr key={phoneNumber.id}>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{phoneNumber.number}</td>
                      <td className="px-3 py-3 text-sm text-gray-600">{phoneNumber.displayName ?? "未設定"}</td>
                      <td className="px-3 py-3">
                        <Badge variant={phoneNumber.company ? "success" : "secondary"}>
                          {phoneNumber.company ? "割当済" : "在庫"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 min-w-56">
                        <Select
                          value={phoneNumber.companyId ?? "stock"}
                          onValueChange={(value) => handleAssign(phoneNumber.id, value)}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="stock">未割当在庫</SelectItem>
                            {companies.map((company) => (
                              <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                  {numbers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">番号在庫がありません</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>追加リクエスト</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pendingRequests.length === 0 ? (
            <p className="text-sm text-gray-400">未対応のリクエストはありません</p>
          ) : (
            pendingRequests.map((request) => (
              <div key={request.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{request.company.name}</p>
                  <Badge variant="warning">未対応</Badge>
                </div>
                <p className="text-sm text-gray-600 whitespace-pre-wrap">
                  {request.note ?? "メモなし"}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => handleRequestStatus(request.id, "APPROVED")}>対応済み</Button>
                  <Button size="sm" variant="outline" onClick={() => handleRequestStatus(request.id, "REJECTED")}>却下</Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
