"use client";

import {
  MessageSquare,
  GitBranch,
  PhoneOff,
  HelpCircle,
  Search,
  PhoneForwarded,
  PhoneCall,
  Bell,
  ClipboardList,
} from "lucide-react";

interface PaletteItem {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  defaultData: Record<string, unknown>;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: "message",
    label: "AIメッセージ",
    description: "AIが発話するメッセージ",
    icon: <MessageSquare className="w-4 h-4" />,
    color: "border-blue-300 bg-blue-50 text-blue-700",
    defaultData: { message: "こちらにメッセージを入力してください。" },
  },
  {
    type: "condition",
    label: "条件分岐",
    description: "用件や入力で分岐",
    icon: <GitBranch className="w-4 h-4" />,
    color: "border-amber-300 bg-amber-50 text-amber-700",
    defaultData: { description: "ご用件は何ですか？", conditions: ["分岐A", "分岐B"] },
  },
  {
    type: "action",
    label: "FAQ回答",
    description: "登録FAQから回答",
    icon: <HelpCircle className="w-4 h-4" />,
    color: "border-cyan-300 bg-cyan-50 text-cyan-700",
    defaultData: { actionType: "faq" },
  },
  {
    type: "action",
    label: "AI回答（RAG）",
    description: "資料を参照してAI回答",
    icon: <Search className="w-4 h-4" />,
    color: "border-indigo-300 bg-indigo-50 text-indigo-700",
    defaultData: { actionType: "rag" },
  },
  {
    type: "action",
    label: "情報収集",
    description: "名前・用件などを聞き取る",
    icon: <ClipboardList className="w-4 h-4" />,
    color: "border-purple-300 bg-purple-50 text-purple-700",
    defaultData: { actionType: "collect", fields: ["お名前", "ご連絡先"] },
  },
  {
    type: "action",
    label: "転送",
    description: "担当者の電話へ転送",
    icon: <PhoneForwarded className="w-4 h-4" />,
    color: "border-orange-300 bg-orange-50 text-orange-700",
    defaultData: { actionType: "transfer", target: "" },
  },
  {
    type: "action",
    label: "折り返し受付",
    description: "折り返し連絡を受け付ける",
    icon: <PhoneCall className="w-4 h-4" />,
    color: "border-pink-300 bg-pink-50 text-pink-700",
    defaultData: { actionType: "callback" },
  },
  {
    type: "action",
    label: "通知送信",
    description: "メール/Slack等で通知",
    icon: <Bell className="w-4 h-4" />,
    color: "border-emerald-300 bg-emerald-50 text-emerald-700",
    defaultData: { actionType: "notify", target: "" },
  },
  {
    type: "end",
    label: "通話終了",
    description: "フローを終了する",
    icon: <PhoneOff className="w-4 h-4" />,
    color: "border-red-300 bg-red-50 text-red-700",
    defaultData: { endMessage: "お電話ありがとうございました。" },
  },
];

interface NodePaletteProps {
  onAddNode: (type: string, data: Record<string, unknown>) => void;
}

export function NodePalette({ onAddNode }: NodePaletteProps) {
  const onDragStart = (
    e: React.DragEvent,
    nodeType: string,
    data: Record<string, unknown>
  ) => {
    e.dataTransfer.setData("application/reactflow/type", nodeType);
    e.dataTransfer.setData("application/reactflow/data", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          ノードを追加
        </p>
        <p className="text-xs text-gray-400 mt-0.5">ドラッグ or クリックで追加</p>
      </div>
      <div className="p-3 space-y-2">
        {PALETTE_ITEMS.map((item, i) => (
          <div
            key={i}
            draggable
            onDragStart={(e) => onDragStart(e, item.type, item.defaultData)}
            onClick={() => onAddNode(item.type, item.defaultData)}
            className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${item.color}`}
          >
            <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight">{item.label}</p>
              <p className="text-xs opacity-70 leading-tight mt-0.5">{item.description}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
