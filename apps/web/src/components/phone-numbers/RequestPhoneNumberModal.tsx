"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { phoneNumbersApi } from "@/lib/api/phone-numbers";

interface RequestPhoneNumberModalProps {
  companyId: string;
  onClose: () => void;
  onRequested: () => void;
}

/**
 * 会社ユーザー向けの電話番号追加リクエスト。
 * 実際の NTT CPaaS 番号登録と割当は、運営管理者が admin 画面で行う。
 */
export function RequestPhoneNumberModal({
  companyId,
  onClose,
  onRequested,
}: RequestPhoneNumberModalProps) {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await phoneNumbersApi.requestAdditionalNumber({
        companyId,
        note: note || undefined,
      });
      onRequested();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "リクエスト送信に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">電話番号追加リクエスト</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="phone-number-request-note">用途・希望条件</Label>
            <Textarea
              id="phone-number-request-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="例：予約受付用に電話番号を1つ追加したい"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            <Button type="submit" disabled={loading || !companyId}>
              {loading ? "送信中..." : "リクエスト送信"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
