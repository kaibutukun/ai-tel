import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  HelpCircle,
  Search,
  PhoneForwarded,
  PhoneCall,
  Bell,
  ClipboardList,
} from "lucide-react";
import { ActionNodeData, ACTION_LABELS, ActionType } from "../types";

const ICONS: Record<ActionType, React.ReactNode> = {
  faq: <HelpCircle className="w-3.5 h-3.5" />,
  rag: <Search className="w-3.5 h-3.5" />,
  transfer: <PhoneForwarded className="w-3.5 h-3.5" />,
  callback: <PhoneCall className="w-3.5 h-3.5" />,
  notify: <Bell className="w-3.5 h-3.5" />,
  collect: <ClipboardList className="w-3.5 h-3.5" />,
};

const COLORS: Record<ActionType, { bg: string; border: string; text: string; ring: string }> = {
  faq: { bg: "bg-cyan-50", border: "border-cyan-400", text: "text-cyan-700", ring: "ring-cyan-200" },
  rag: { bg: "bg-indigo-50", border: "border-indigo-400", text: "text-indigo-700", ring: "ring-indigo-200" },
  transfer: { bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-700", ring: "ring-orange-200" },
  callback: { bg: "bg-pink-50", border: "border-pink-400", text: "text-pink-700", ring: "ring-pink-200" },
  notify: { bg: "bg-emerald-50", border: "border-emerald-400", text: "text-emerald-700", ring: "ring-emerald-200" },
  collect: { bg: "bg-purple-50", border: "border-purple-400", text: "text-purple-700", ring: "ring-purple-200" },
};

// transfer は転送したら終わり（output なし）、その他は 1 output
const HAS_OUTPUT: Record<ActionType, boolean> = {
  faq: true,
  rag: true,
  transfer: false,
  callback: true,
  notify: true,
  collect: true,
};

function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  const type = data.actionType || "faq";
  const col = COLORS[type];
  const borderClass = selected
    ? `${col.border} ring-2 ${col.ring}`
    : col.border;

  return (
    <div
      className={`rounded-xl border-2 bg-white shadow-md min-w-[180px] ${borderClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={`!w-3 !h-3 !border-2 !border-white`}
        style={{ backgroundColor: col.text.replace("text-", "#") }}
      />
      <div
        className={`flex items-center gap-2 px-4 py-2 ${col.bg} rounded-t-xl border-b ${col.border}`}
      >
        <span className={col.text}>{ICONS[type]}</span>
        <span className={`text-xs font-semibold ${col.text} uppercase tracking-wide`}>
          {ACTION_LABELS[type]}
        </span>
      </div>
      <div className="px-4 py-3">
        {type === "transfer" && data.target && (
          <p className="text-xs text-gray-500">転送先: {data.target}</p>
        )}
        {type === "notify" && data.target && (
          <p className="text-xs text-gray-500">通知先: {data.target}</p>
        )}
        {type === "collect" && data.fields && data.fields.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.fields.map((f) => (
              <span
                key={f}
                className="px-1.5 py-0.5 rounded bg-gray-100 text-xs text-gray-600"
              >
                {f}
              </span>
            ))}
          </div>
        )}
        {!data.target && !data.fields?.length && (
          <p className="text-xs text-gray-400 italic">設定してください</p>
        )}
      </div>
      {HAS_OUTPUT[type] && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !border-2 !border-white !bg-gray-400"
        />
      )}
    </div>
  );
}

export default memo(ActionNode);
