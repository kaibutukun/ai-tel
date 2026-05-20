// NTT CPaaS / Infobip Calls API WebSocket endpoint のメッセージ型。
// 音声フレームは JSON ではなく raw binary の Linear PCM 16-bit little-endian。

export interface NttCpaasConnectedMessage {
  event: "websocket:connected";
  "content-type"?: string;
  callId?: string;
  callSessionId?: string;
  phoneNumberId?: string;
  companyId?: string;
  flowId?: string;
  [key: string]: string | undefined;
}

export interface NttCpaasDtmfMessage {
  event: "websocket:dtmf";
  digit: string;
  duration?: number;
}

export type NttCpaasTextMessage = NttCpaasConnectedMessage | NttCpaasDtmfMessage;
