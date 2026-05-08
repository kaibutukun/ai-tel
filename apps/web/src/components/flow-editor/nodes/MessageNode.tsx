import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { MessageSquare } from "lucide-react";
import { MessageNodeData } from "../types";

function MessageNode({ data, selected }: NodeProps<MessageNodeData>) {
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
        <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
          AIメッセージ
        </span>
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
