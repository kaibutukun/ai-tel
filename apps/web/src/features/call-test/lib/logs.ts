import type { CallLog, LogKind } from "../model/types";

function formatNow() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function makeLog(kind: LogKind, message: string): CallLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    time: formatNow(),
  };
}

export function stringifyToolPayload(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
