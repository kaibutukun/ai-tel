"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callFlowsApi, type CallFlow } from "@/lib/api/call-flows";
import { phoneNumbersApi, type PhoneNumber } from "@/lib/api/phone-numbers";

interface CreatePhoneNumberModalProps {
  companyId: string;
  onClose: () => void;
  onCreated: (phoneNumber: PhoneNumber) => void;
}

/**
 * Twilio Console で取得済みの番号をアプリへ登録するモーダル。
 * Twilio の認証情報はサーバー .env で管理し、ユーザー画面には入力させない。
 */
export function CreatePhoneNumberModal({
  companyId,
  onClose,
  onCreated,
}: CreatePhoneNumberModalProps) {
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [number, setNumber] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [twilioSid, setTwilioSid] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [callFlowId, setCallFlowId] = useState("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    callFlowsApi
      .list(companyId)
      .then((res) => setFlows(res.data))
      .catch(() => setFlows([]));
  }, [companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await phoneNumbersApi.create({
        companyId,
        number,
        displayName: displayName || undefined,
        twilioSid: twilioSid || undefined,
        transferTo: transferTo || undefined,
        callFlowId: callFlowId === "none" ? undefined : callFlowId,
        isActive: true,
      });
      onCreated(res.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "電話番号の登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Twilio番号を登録</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="twilio-number">電話番号 *</Label>
            <Input
              id="twilio-number"
              placeholder="+15717175671"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500">
              Twilio の Number と同じ値を、国番号付きの E.164 形式で入力します。
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="twilio-display-name">表示名</Label>
              <Input
                id="twilio-display-name"
                placeholder="代表回線"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="twilio-sid">Twilio SID</Label>
              <Input
                id="twilio-sid"
                placeholder="PNxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={twilioSid}
                onChange={(e) => setTwilioSid(e.target.value)}
              />
              <p className="text-xs text-gray-500">任意。Twilio管理画面で確認用に使うIDです。</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="twilio-transfer-to">転送先</Label>
            <Input
              id="twilio-transfer-to"
              placeholder="+819012345678"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              任意。入力した場合はAI応答せず、この番号へ転送します。
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="twilio-call-flow">対応フロー</Label>
            <Select value={callFlowId} onValueChange={setCallFlowId}>
              <SelectTrigger id="twilio-call-flow">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">未設定</SelectItem>
                {flows.map((flow) => (
                  <SelectItem key={flow.id} value={flow.id}>
                    {flow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading || !companyId}>
              {loading ? "登録中..." : "登録"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
