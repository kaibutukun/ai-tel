"use client";

import { Node } from "reactflow";
import { X, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AnyNodeData,
  MessageNodeData,
  ConditionNodeData,
  ActionNodeData,
  EndNodeData,
  ACTION_LABELS,
  ActionType,
} from "./types";

interface NodeConfigPanelProps {
  node: Node<AnyNodeData>;
  onChange: (id: string, data: Partial<AnyNodeData>) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export function NodeConfigPanel({ node, onChange, onClose, onDelete }: NodeConfigPanelProps) {
  const update = (patch: Partial<AnyNodeData>) => onChange(node.id, patch);

  return (
    <aside className="w-72 bg-white border-l border-gray-200 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-800">ノード設定</p>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 space-y-4 overflow-y-auto">
        {node.type === "message" && (
          <MessageConfig data={node.data as MessageNodeData} update={update} />
        )}
        {node.type === "condition" && (
          <ConditionConfig data={node.data as ConditionNodeData} update={update} />
        )}
        {node.type === "action" && (
          <ActionConfig data={node.data as ActionNodeData} update={update} />
        )}
        {node.type === "end" && (
          <EndConfig data={node.data as EndNodeData} update={update} />
        )}
        {node.type === "start" && (
          <p className="text-sm text-gray-400">
            スタートノードは編集できません。
          </p>
        )}
      </div>

      {node.type !== "start" && (
        <div className="p-4 border-t border-gray-200">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => onDelete(node.id)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            このノードを削除
          </Button>
        </div>
      )}
    </aside>
  );
}

function MessageConfig({
  data,
  update,
}: {
  data: MessageNodeData;
  update: (p: Partial<MessageNodeData>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs">AIが話すメッセージ</Label>
        <Textarea
          rows={5}
          value={data.message || ""}
          onChange={(e) => update({ message: e.target.value })}
          placeholder="お電話ありがとうございます。..."
        />
      </div>
    </div>
  );
}

function ConditionConfig({
  data,
  update,
}: {
  data: ConditionNodeData;
  update: (p: Partial<ConditionNodeData>) => void;
}) {
  const conditions = data.conditions || [];

  const addCondition = () => {
    update({ conditions: [...conditions, `分岐${conditions.length + 1}`] });
  };

  const removeCondition = (i: number) => {
    update({ conditions: conditions.filter((_, idx) => idx !== i) });
  };

  const updateCondition = (i: number, value: string) => {
    const next = [...conditions];
    next[i] = value;
    update({ conditions: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">説明（任意）</Label>
        <Input
          value={data.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="ご用件をお聞かせください"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">分岐条件</Label>
          <Button variant="ghost" size="sm" onClick={addCondition} className="h-6 px-2 text-xs">
            <Plus className="w-3 h-3 mr-1" />
            追加
          </Button>
        </div>
        <p className="text-xs text-gray-400">各条件が下部ハンドルに対応します</p>
        <div className="space-y-2">
          {conditions.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs flex items-center justify-center font-medium flex-shrink-0">
                {i + 1}
              </div>
              <Input
                value={c}
                onChange={(e) => updateCondition(i, e.target.value)}
                className="h-8 text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-gray-400"
                onClick={() => removeCondition(i)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ActionConfig({
  data,
  update,
}: {
  data: ActionNodeData;
  update: (p: Partial<ActionNodeData>) => void;
}) {
  const fields = data.fields || [];

  const addField = () => update({ fields: [...fields, ""] });
  const removeField = (i: number) => update({ fields: fields.filter((_, idx) => idx !== i) });
  const updateField = (i: number, v: string) => {
    const next = [...fields];
    next[i] = v;
    update({ fields: next });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">アクション種別</Label>
        <Select
          value={data.actionType}
          onValueChange={(v) => update({ actionType: v as ActionType })}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((k) => (
              <SelectItem key={k} value={k} className="text-xs">
                {ACTION_LABELS[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(data.actionType === "transfer" || data.actionType === "notify") && (
        <div className="space-y-1.5">
          <Label className="text-xs">
            {data.actionType === "transfer" ? "転送先電話番号" : "通知先"}
          </Label>
          <Input
            value={data.target || ""}
            onChange={(e) => update({ target: e.target.value })}
            placeholder={
              data.actionType === "transfer"
                ? "090-1234-5678"
                : "email@example.com"
            }
            className="h-8 text-xs"
          />
        </div>
      )}

      {data.actionType === "collect" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">収集する項目</Label>
            <Button variant="ghost" size="sm" onClick={addField} className="h-6 px-2 text-xs">
              <Plus className="w-3 h-3 mr-1" />
              追加
            </Button>
          </div>
          <div className="space-y-1.5">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={f}
                  onChange={(e) => updateField(i, e.target.value)}
                  placeholder="例: お名前"
                  className="h-8 text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-gray-400"
                  onClick={() => removeField(i)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EndConfig({
  data,
  update,
}: {
  data: EndNodeData;
  update: (p: Partial<EndNodeData>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">終了メッセージ</Label>
      <Textarea
        rows={3}
        value={data.endMessage || ""}
        onChange={(e) => update({ endMessage: e.target.value })}
        placeholder="お電話ありがとうございました。"
      />
    </div>
  );
}
