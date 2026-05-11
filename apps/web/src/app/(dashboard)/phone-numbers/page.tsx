"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Phone, Settings } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CreatePhoneNumberModal } from "@/components/phone-numbers/CreatePhoneNumberModal";
import { phoneNumbersApi, type PhoneNumber } from "@/lib/api/phone-numbers";
import { getCompanyId } from "@/lib/get-company-id";

// 曜日ラベル
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

function formatBusinessHours(hours: PhoneNumber["businessHours"]): string {
  if (!hours || hours.length === 0) return "未設定";
  const active = hours.filter((h) => !h.isClosed);
  if (active.length === 0) return "定休日";
  const first = active[0];
  return `${first.openTime}〜${first.closeTime}`;
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchNumbers = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) return;
    try {
      const res = await phoneNumbersApi.list(companyId);
      setNumbers(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNumbers(); }, [fetchNumbers]);

  const toggleActive = async (id: string, current: boolean) => {
    try {
      const res = await phoneNumbersApi.update(id, { isActive: !current });
      setNumbers((prev) => prev.map((n) => n.id === id ? res.data : n));
    } catch {
      alert("更新に失敗しました");
    }
  };

  const handleCreated = (phoneNumber: PhoneNumber) => {
    setNumbers((prev) => [...prev, phoneNumber]);
  };

  return (
    <>
      <Header title="電話番号管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録済み電話番号: {loading ? "—" : `${numbers.length} 件`}
          </p>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />電話番号を追加
          </Button>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && numbers.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">電話番号がまだ登録されていません</p>
        )}

        <div className="grid gap-4">
          {numbers.map((num) => (
            <Card key={num.id} className={!num.isActive ? "opacity-60" : ""}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${num.isActive ? "bg-blue-50" : "bg-gray-100"}`}>
                      <Phone className={`w-6 h-6 ${num.isActive ? "text-blue-600" : "text-gray-400"}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-lg font-semibold text-gray-900">{num.number}</p>
                        <Badge variant={num.isActive ? "success" : "secondary"}>
                          {num.isActive ? "有効" : "無効"}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-500">{num.displayName ?? "表示名未設定"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">対応フロー</p>
                      <p className="text-sm font-medium text-gray-700">{num.callFlow?.name ?? "未設定"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">営業時間</p>
                      <p className="text-sm font-medium text-gray-700">{formatBusinessHours(num.businessHours)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400 mb-1">転送先</p>
                      <p className="text-sm font-medium text-gray-700">{num.transferTo ?? "なし"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch checked={num.isActive} onCheckedChange={() => toggleActive(num.id, num.isActive)} />
                      <Button variant="ghost" size="icon">
                        <Settings className="w-4 h-4 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>

      {showCreateModal && (
        <CreatePhoneNumberModal
          companyId={getCompanyId()}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
}
