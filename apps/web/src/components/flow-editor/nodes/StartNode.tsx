import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { Phone } from "lucide-react";
import { StartNodeData } from "../types";

function StartNode({ selected }: NodeProps<StartNodeData>) {
  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-md min-w-[160px] ${
        selected ? "border-green-500 ring-2 ring-green-200" : "border-green-400"
      }`}
    >
      <div className="flex items-center gap-2 px-4 py-3 bg-green-50 rounded-t-xl border-b border-green-200">
        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
          <Phone className="w-3 h-3 text-white" />
        </div>
        <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">
          START
        </span>
      </div>
      <div className="px-4 py-2">
        <p className="text-sm font-medium text-gray-700">電話着信</p>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(StartNode);
