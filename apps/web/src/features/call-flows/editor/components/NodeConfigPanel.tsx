"use client";

import { Node } from "reactflow";
import { X, Plus, Trash2, Lock, Sparkles } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Textarea } from "@/shared/ui/textarea";
import {
  AnyNodeData,
  MessageNodeData,
  ConditionNodeData,
  ActionNodeData,
  EndNodeData,
  MessageStrictness,
  FAQ_PRECISION_DEFAULT,
  FAQ_PRECISION_MIN,
  FAQ_PRECISION_MAX,
  FAQ_PRECISION_STEP,
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
          <div className="space-y-2">
            <p className="text-sm text-gray-500">
              スタートノードは編集できません。
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              ここからフローが始まります。最初に「固定の挨拶」を置きたい場合は AIメッセージ（固定）を接続してください。
            </p>
          </div>
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

// ── メッセージノード設定: 厳密度トグル + 文面
function MessageConfig({
  data,
  update,
}: {
  data: MessageNodeData;
  update: (p: Partial<MessageNodeData>) => void;
}) {
  const strictness: MessageStrictness = data.strictness ?? "loose";

  return (
    <div className="space-y-3">
      {/* 厳密度トグル: locked と loose の二択 */}
      <div className="space-y-1.5">
        <Label className="text-xs">発話の厳密度</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update({ strictness: "loose" })}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-xs transition-colors ${
              strictness === "loose"
                ? "bg-blue-50 border-blue-400 text-blue-700 font-medium"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            おおざっぱ
          </button>
          <button
            type="button"
            onClick={() => update({ strictness: "locked" })}
            className={`flex items-center justify-center gap-1.5 px-2 py-2 rounded-md border text-xs transition-colors ${
              strictness === "locked"
                ? "bg-blue-50 border-blue-400 text-blue-700 font-medium"
                : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            <Lock className="w-3 h-3" />
            一字一句固定
          </button>
        </div>
        <p className="text-[10px] text-gray-400">
          {strictness === "locked"
            ? "このノードに入った瞬間、必ずこの文をそのまま発話します（開幕挨拶・コンプラ文言向け）"
            : "AIが文脈に合わせて言い回しを調整します。文脈上不要なら省略されることもあります"}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">
          {strictness === "locked" ? "発話する文（固定）" : "伝えたい内容"}
        </Label>
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
        <p className="text-[10px] text-gray-400">
          AIが会話の流れから判断して分岐します。キーワード一致ではありません。
        </p>
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

// アクションノード設定: 種別はパレットから追加した時点で確定。ここでは種別固有のパラメータのみ編集する。
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
          <p className="text-[10px] text-gray-400">
            AIは全項目が埋まるまで自然に対話を続けます。
          </p>
        </div>
      )}

      {data.actionType === "faq" && (
        <FaqPrecisionConfig data={data} update={update} />
      )}

      {data.actionType === "rag" && (
        <p className="text-[11px] text-gray-500">
          このノードでは追加設定はありません。AIが必要に応じて参考資料を読み取り、回答を組み立てます。
        </p>
      )}
    </div>
  );
}

// FAQ ノードの精度設定: 0.5〜0.9 のスライダー。
// 値が高いほど登録FAQとの一致度が高いものだけを採用する（精度↑/件数↓）。
// 低いほど緩く拾う（網羅↑/精度↓）。
function FaqPrecisionConfig({
  data,
  update,
}: {
  data: ActionNodeData;
  update: (p: Partial<ActionNodeData>) => void;
}) {
  const value = data.precision ?? FAQ_PRECISION_DEFAULT;
  const setValue = (v: number) => update({ precision: v });

  // 視覚的ラベル
  const label =
    value <= 0.6 ? "ゆるい（網羅重視）" :
    value < 0.75 ? "標準" :
    value < 0.85 ? "厳しめ" :
    "とても厳しい";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs">FAQ一致の厳しさ</Label>
        <span className="text-xs font-mono text-gray-600">
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={FAQ_PRECISION_MIN}
        max={FAQ_PRECISION_MAX}
        step={FAQ_PRECISION_STEP}
        value={value}
        onChange={(e) => setValue(Number.parseFloat(e.target.value))}
        className="w-full h-1.5 bg-gradient-to-r from-amber-200 via-cyan-200 to-cyan-500 rounded-full appearance-none cursor-pointer accent-cyan-600"
      />
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>{FAQ_PRECISION_MIN}</span>
        <span className="text-cyan-600 font-medium">{label}</span>
        <span>{FAQ_PRECISION_MAX}</span>
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">
        質問が登録FAQにこの値以上の一致度で当てはまる場合のみ使います。
        高いほど「ちゃんと一致した時だけ」FAQで答え、低いほど近そうなFAQも使います。
      </p>
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
      <p className="text-[10px] text-gray-400">
        AIがお礼を述べてから通話を切ります。文面はおおまかな指針で、文脈に合わせて調整されます。
      </p>
    </div>
  );
}
