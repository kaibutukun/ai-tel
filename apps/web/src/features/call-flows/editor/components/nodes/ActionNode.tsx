import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import {
  HelpCircle,
  Search,
  PhoneForwarded,
  Bell,
  ClipboardList,
} from "lucide-react";
import { ActionNodeData, ACTION_LABELS, ActionType, FAQ_PRECISION_DEFAULT } from "../types";

// callback (折り返し受付) は廃止。残りの actionType を表示マッピング。
const ICONS: Record<ActionType, React.ReactNode> = {
  faq: <HelpCircle className="w-3.5 h-3.5" />,
  rag: <Search className="w-3.5 h-3.5" />,
  transfer: <PhoneForwarded className="w-3.5 h-3.5" />,
  notify: <Bell className="w-3.5 h-3.5" />,
  collect: <ClipboardList className="w-3.5 h-3.5" />,
};

const COLORS: Record<ActionType, { bg: string; border: string; text: string; ring: string }> = {
  faq:      { bg: "bg-cyan-50",     border: "border-cyan-400",     text: "text-cyan-700",     ring: "ring-cyan-200" },
  rag:      { bg: "bg-indigo-50",   border: "border-indigo-400",   text: "text-indigo-700",   ring: "ring-indigo-200" },
  transfer: { bg: "bg-orange-50",   border: "border-orange-400",   text: "text-orange-700",   ring: "ring-orange-200" },
  notify:   { bg: "bg-emerald-50",  border: "border-emerald-400",  text: "text-emerald-700",  ring: "ring-emerald-200" },
  collect:  { bg: "bg-purple-50",   border: "border-purple-400",   text: "text-purple-700",   ring: "ring-purple-200" },
};

// transfer は転送したら通話側はそちらに渡るのでフロー的に出力なし。
const HAS_OUTPUT: Record<ActionType, boolean> = {
  faq: true,
  rag: true,
  transfer: false,
  notify: true,
  collect: true,
};

function ActionNode({ data, selected }: NodeProps<ActionNodeData>) {
  // 旧データに "callback" が混ざっていた場合のフォールバック。
  const type: ActionType = (data.actionType && data.actionType in COLORS)
    ? (data.actionType as ActionType)
    : "faq";
  const col = COLORS[type];
  const borderClass = selected ? `${col.border} ring-2 ${col.ring}` : col.border;

  return (
    <div className={`rounded-xl border-2 bg-white shadow-md min-w-[180px] ${borderClass}`}>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !border-2 !border-white !bg-gray-400"
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
        {type === "faq" && (
          <p className="text-xs text-gray-500">
            厳しさ: {(data.precision ?? FAQ_PRECISION_DEFAULT).toFixed(2)}
          </p>
        )}
        {(type === "transfer" || type === "notify") && !data.target && (
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
