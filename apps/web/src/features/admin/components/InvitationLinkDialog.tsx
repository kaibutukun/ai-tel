"use client";

import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface InvitationLinkDialogProps {
  title?: string;
  description?: string;
  url: string;
  expiresAt: string;
  onClose: () => void;
}

/**
 * 招待リンクを画面に表示してコピーさせる共通ダイアログ。
 * メール送信は実装しないため、運営者 / 管理者が手元で相手に渡す前提。
 */
export function InvitationLinkDialog({
  title = "招待リンクを発行しました",
  description = "このリンクを相手に渡してください。パスワードを設定するとログインできるようになります。",
  url,
  expiresAt,
  onClose,
}: InvitationLinkDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 古いブラウザ向けのフォールバック
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-gray-600">{description}</p>

        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-0 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-700"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                  コピー済
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  コピー
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-gray-400">
            有効期限: {new Date(expiresAt).toLocaleString("ja-JP")}
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" onClick={onClose}>
            閉じる
          </Button>
        </div>
      </div>
    </div>
  );
}
