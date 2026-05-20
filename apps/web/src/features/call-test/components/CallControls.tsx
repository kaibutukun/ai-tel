import { Mic, MicOff, PhoneOff, Play, RefreshCw } from "lucide-react";
import type { CallFlow } from "@/entities/call-flow/api/call-flows-api";
import type { PhoneNumber } from "@/entities/phone-number/api/phone-numbers-api";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/ui/select";
import { NO_FLOW, NO_PHONE_NUMBER, type CallStatus } from "../model/types";

interface CallControlsProps {
  companyId: string;
  flows: CallFlow[];
  phoneNumbers: PhoneNumber[];
  selectedFlowId: string;
  selectedPhoneNumberId: string;
  status: CallStatus;
  statusLabel: string;
  muted: boolean;
  connected: boolean;
  loadingSettings: boolean;
  onFlowChange: (value: string) => void;
  onPhoneNumberChange: (value: string) => void;
  onReload: () => void;
  onToggleMuted: () => void;
  onStart: () => void;
  onEnd: () => void;
}

export function CallControls({
  companyId,
  flows,
  phoneNumbers,
  selectedFlowId,
  selectedPhoneNumberId,
  status,
  statusLabel,
  muted,
  connected,
  loadingSettings,
  onFlowChange,
  onPhoneNumberChange,
  onReload,
  onToggleMuted,
  onStart,
  onEnd,
}: CallControlsProps) {
  return (
    <section className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[260px_260px]">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">対応フロー</label>
            <Select
              value={selectedFlowId}
              onValueChange={onFlowChange}
              disabled={connected || loadingSettings}
            >
              <SelectTrigger>
                <SelectValue placeholder="フローを選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_FLOW}>フローなし</SelectItem>
                {flows.map((flow) => (
                  <SelectItem key={flow.id} value={flow.id}>
                    {flow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">電話番号設定</label>
            <Select
              value={selectedPhoneNumberId}
              onValueChange={onPhoneNumberChange}
              disabled={connected || loadingSettings}
            >
              <SelectTrigger>
                <SelectValue placeholder="番号設定を選択" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PHONE_NUMBER}>指定なし</SelectItem>
                {phoneNumbers.map((phoneNumber) => (
                  <SelectItem key={phoneNumber.id} value={phoneNumber.id}>
                    {phoneNumber.displayName ?? phoneNumber.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={
              status === "connected"
                ? "success"
                : status === "error"
                  ? "destructive"
                  : status === "connecting"
                    ? "warning"
                    : "secondary"
            }
          >
            {statusLabel}
          </Badge>
          <Button variant="outline" size="icon" onClick={onReload} disabled={connected}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={onToggleMuted} disabled={!connected}>
            {muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
            {muted ? "ミュート中" : "マイク"}
          </Button>
          {connected ? (
            <Button variant="destructive" onClick={onEnd}>
              <PhoneOff className="mr-2 h-4 w-4" />
              終了
            </Button>
          ) : (
            <Button onClick={onStart} disabled={!companyId || loadingSettings}>
              <Play className="mr-2 h-4 w-4" />
              開始
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
