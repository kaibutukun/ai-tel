import type { CallFlow } from "@/entities/call-flow/api/call-flows-api";
import type { PhoneNumber } from "@/entities/phone-number/api/phone-numbers-api";

export const INPUT_SAMPLE_RATE = 24000;
export const NO_FLOW = "__no_flow__";
export const NO_PHONE_NUMBER = "__no_phone_number__";

export type CallStatus = "idle" | "connecting" | "connected" | "ended" | "error";

export type LogKind = "system" | "assistant" | "user" | "tool" | "error";

export interface CallLog {
  id: string;
  kind: LogKind;
  message: string;
  time: string;
}

export type DevCallEvent =
  | {
      type: "started";
      callSessionId: string;
      providerCallId: string;
      flowId: string | null;
      phoneNumberId: string | null;
    }
  | { type: "text_delta"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "assistant_transcript_done"; text: string }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      output: Record<string, unknown>;
      sideEffect?: Record<string, unknown>;
    }
  | { type: "error"; message: string }
  | { type: "ended"; reason: string };

export interface CallTestState {
  companyId: string;
  flows: CallFlow[];
  phoneNumbers: PhoneNumber[];
  selectedFlowId: string;
  selectedPhoneNumberId: string;
  status: CallStatus;
  statusLabel: string;
  muted: boolean;
  loadingSettings: boolean;
  logs: CallLog[];
  connected: boolean;
}
