import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { MessageSquare, Lock } from "lucide-react";
import { MessageNodeData } from "../types";

// メッセージノード。strictness が "locked" のときは見た目で固定発話だと分かるバッジを出す。
function MessageNode({ data, selected }: NodeProps<MessageNodeData>) {
  const isLocked = data.strictness === "locked";

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-md min-w-[200px] max-w-[260px] ${
        selected ? "border-blue-500 ring-2 ring-blue-200" : "border-blue-400"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-t-xl border-b border-blue-200">
        <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex-1">
          AIメッセージ
        </span>
        {isLocked && (
          // 一字一句固定で発話する印（開幕挨拶／コンプラ系で使う）
          <span
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700"
            title="この発話は一字一句固定で行います"
          >
            <Lock className="w-2.5 h-2.5" />
            固定
          </span>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3">
          {data.message || "メッセージを入力してください"}
        </p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(MessageNode);
