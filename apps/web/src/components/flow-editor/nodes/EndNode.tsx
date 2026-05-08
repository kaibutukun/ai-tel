import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { PhoneOff } from "lucide-react";
import { EndNodeData } from "../types";

function EndNode({ data, selected }: NodeProps<EndNodeData>) {
  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-md min-w-[160px] ${
        selected ? "border-red-500 ring-2 ring-red-200" : "border-red-400"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-red-400 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-t-xl border-b border-red-200">
        <PhoneOff className="w-3.5 h-3.5 text-red-600" />
        <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
          通話終了
        </span>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 line-clamp-2">
          {data.endMessage || "通話を終了します"}
        </p>
      </div>
    </div>
  );
}

export default memo(EndNode);
