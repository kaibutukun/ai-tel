import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { GitBranch } from "lucide-react";
import { ConditionNodeData } from "../types";

function ConditionNode({ data, selected }: NodeProps<ConditionNodeData>) {
  const conditions = data.conditions?.length ? data.conditions : ["分岐1", "分岐2"];
  const spread = 100 / (conditions.length + 1);

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-md min-w-[220px] ${
        selected ? "border-amber-500 ring-2 ring-amber-200" : "border-amber-400"
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
      />
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 rounded-t-xl border-b border-amber-200">
        <GitBranch className="w-3.5 h-3.5 text-amber-600" />
        <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
          条件分岐
        </span>
      </div>
      <div className="px-4 py-3 pb-6">
        <p className="text-xs text-gray-500 mb-2">
          {data.description || "ユーザーの用件を分類"}
        </p>
        <div className="flex flex-wrap gap-1">
          {conditions.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 border border-amber-200"
            >
              {c}
            </span>
          ))}
        </div>
      </div>
      {/* Dynamic output handles — one per condition */}
      {conditions.map((condition, i) => (
        <Handle
          key={condition}
          type="source"
          position={Position.Bottom}
          id={`cond-${i}`}
          style={{ left: `${spread * (i + 1)}%` }}
          className="!w-3 !h-3 !bg-amber-500 !border-2 !border-white"
          title={condition}
        />
      ))}
    </div>
  );
}

export default memo(ConditionNode);
