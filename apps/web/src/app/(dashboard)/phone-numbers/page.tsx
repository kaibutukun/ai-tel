"use client";

import { useState, useEffect, useCallback } from "react";
import type { FormEvent } from "react";
import { Plus, Phone, Settings } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RequestPhoneNumberModal } from "@/components/phone-numbers/RequestPhoneNumberModal";
import { phoneNumbersApi, type PhoneNumber } from "@/lib/api/phone-numbers";
import { callFlowsApi, type CallFlow } from "@/lib/api/call-flows";
import { getCompanyId } from "@/lib/get-company-id";

function formatBusinessHours(hours: PhoneNumber["businessHours"]): string {
  if (!hours || hours.length === 0) return "未設定";
  const active = hours.filter((h) => !h.isClosed);
  if (active.length === 0) return "定休日";
  const first = active[0];
  return `${first.openTime}〜${first.closeTime}`;
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [editingNumberId, setEditingNumberId] = useState<string | null>(null);

  const fetchNumbers = useCallback(async () => {
    const companyId = getCompanyId();
    if (!companyId) {
      setLoading(false);
      return;
    }
    try {
      const [numbersRes, flowsRes] = await Promise.all([
        phoneNumbersApi.list(companyId),
        callFlowsApi.list(companyId),
      ]);
      setNumbers(numbersRes.data);
      setFlows(flowsRes.data);
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

  const handleSettingsSaved = (phoneNumber: PhoneNumber) => {
    setNumbers((prev) => prev.map((n) => n.id === phoneNumber.id ? phoneNumber : n));
    setEditingNumberId(null);
  };

  return (
    <>
      <Header title="電話番号管理" />
      <main className="flex-1 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            登録済み電話番号: {loading ? "—" : `${numbers.length} 件`}
          </p>
          <Button onClick={() => setShowRequestModal(true)}>
            <Plus className="w-4 h-4 mr-2" />追加リクエスト
          </Button>
        </div>

        {loading && <p className="text-sm text-gray-400 py-8 text-center">読み込み中...</p>}

        {!loading && numbers.length === 0 && (
          <p className="text-sm text-gray-400 py-8 text-center">電話番号がまだ登録されていません</p>
        )}

        <div className="grid gap-4">
          {numbers.map((num) => {
            const isEditing = editingNumberId === num.id;
            return (
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
                    <div className="flex items-center gap-3">
                      <Switch checked={num.isActive} onCheckedChange={() => toggleActive(num.id, num.isActive)} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingNumberId(isEditing ? null : num.id)}
                        aria-label={`${num.number}の設定を編集`}
                      >
                        <Settings className="w-4 h-4 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
                {isEditing && (
                  <PhoneNumberSettingsForm
                    phoneNumber={num}
                    flows={flows}
                    onCancel={() => setEditingNumberId(null)}
                    onSaved={handleSettingsSaved}
                  />
                )}
              </CardContent>
            </Card>
            );
          })}
        </div>
      </main>

      {showRequestModal && (
        <RequestPhoneNumberModal
          companyId={getCompanyId()}
          onClose={() => setShowRequestModal(false)}
          onRequested={() => alert("電話番号追加リクエストを送信しました")}
        />
      )}
    </>
  );
}

const NO_FLOW_VALUE = "__none__";

interface PhoneNumberSettingsFormProps {
  phoneNumber: PhoneNumber;
  flows: CallFlow[];
  onCancel: () => void;
  onSaved: (phoneNumber: PhoneNumber) => void;
}

function PhoneNumberSettingsForm({
  phoneNumber,
  flows,
  onCancel,
  onSaved,
}: PhoneNumberSettingsFormProps) {
  const [displayName, setDisplayName] = useState(phoneNumber.displayName ?? "");
  const [callFlowId, setCallFlowId] = useState(phoneNumber.callFlowId ?? NO_FLOW_VALUE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(phoneNumber.displayName ?? "");
    setCallFlowId(phoneNumber.callFlowId ?? NO_FLOW_VALUE);
    setError(null);
  }, [phoneNumber]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await phoneNumbersApi.update(phoneNumber.id, {
        displayName: displayName.trim() || null,
        callFlowId: callFlowId === NO_FLOW_VALUE ? null : callFlowId,
      });
      onSaved(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 grid gap-4 border-t border-gray-100 pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
    >
      <div className="space-y-1.5">
        <Label htmlFor={`phone-display-name-${phoneNumber.id}`}>表示名</Label>
        <Input
          id={`phone-display-name-${phoneNumber.id}`}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="例：代表番号"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`phone-call-flow-${phoneNumber.id}`}>対応フロー</Label>
        <Select value={callFlowId} onValueChange={setCallFlowId}>
          <SelectTrigger id={`phone-call-flow-${phoneNumber.id}`}>
            <SelectValue placeholder="対応フローを選択" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FLOW_VALUE}>未設定</SelectItem>
            {flows.map((flow) => (
              <SelectItem key={flow.id} value={flow.id}>
                {flow.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-end justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          キャンセル
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "保存中..." : "保存"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-500 md:col-span-3">{error}</p>
      )}
    </form>
  );
}
