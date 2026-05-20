import { Volume2, Wrench } from "lucide-react";

interface ConnectionInfoProps {
  companyId: string;
  wsUrl: string;
}

export function ConnectionInfo({ companyId, wsUrl }: ConnectionInfoProps) {
  return (
    <aside className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
      <div className="flex items-center gap-2">
        <Volume2 className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-gray-900">接続情報</h2>
      </div>
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-xs text-gray-500">WebSocket</dt>
          <dd className="mt-1 break-all text-gray-800">{wsUrl}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">音声形式</dt>
          <dd className="mt-1 text-gray-800">PCM16 / 24kHz / mono</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">会社ID</dt>
          <dd className="mt-1 break-all text-gray-800">{companyId || "未取得"}</dd>
        </div>
      </dl>
      <div className="border-t border-gray-200 pt-5">
        <div className="mb-2 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-gray-900">確認できる動き</h3>
        </div>
        <p className="text-sm leading-6 text-gray-600">
          FAQ検索、資料検索、情報収集、通知、転送、通話終了のツール呼び出しはログに表示されます。
        </p>
      </div>
    </aside>
  );
}
