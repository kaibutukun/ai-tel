// Twilio Media Streams WebSocket メッセージの型。
// 参考: https://www.twilio.com/docs/voice/twiml/stream#message-format
//
// Twilio が WebSocket で送ってくる音声は g711 µ-law、base64 エンコード、20ms チャンク、8kHz。
// 送り返す側も同じフォーマット。

export type TwilioInboundMessage =
  | TwilioConnectedMessage
  | TwilioStartMessage
  | TwilioMediaMessage
  | TwilioStopMessage
  | TwilioMarkMessage
  | TwilioDtmfMessage;

export interface TwilioConnectedMessage {
  event: "connected";
  protocol: string;
  version: string;
}

export interface TwilioStartMessage {
  event: "start";
  sequenceNumber: string;
  start: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
    /** <Stream> の <Parameter> で渡した値が入る（companyId / flowId 等） */
    customParameters?: Record<string, string>;
  };
  streamSid: string;
}

export interface TwilioMediaMessage {
  event: "media";
  sequenceNumber: string;
  media: {
    track: "inbound" | "outbound";
    chunk: string;
    timestamp: string;
    /** g711 µ-law / base64 */
    payload: string;
  };
  streamSid: string;
}

export interface TwilioStopMessage {
  event: "stop";
  sequenceNumber: string;
  stop: { accountSid: string; callSid: string };
  streamSid: string;
}

export interface TwilioMarkMessage {
  event: "mark";
  streamSid: string;
  sequenceNumber: string;
  mark: { name: string };
}

export interface TwilioDtmfMessage {
  event: "dtmf";
  streamSid: string;
  sequenceNumber: string;
  dtmf: { track: string; digit: string };
}

// Twilio へ送り返すメッセージ
export type TwilioOutboundMessage = TwilioMediaOutbound | TwilioMarkOutbound | TwilioClearOutbound;

export interface TwilioMediaOutbound {
  event: "media";
  streamSid: string;
  media: { payload: string };
}

export interface TwilioMarkOutbound {
  event: "mark";
  streamSid: string;
  mark: { name: string };
}

/** 再生中のキューを破棄させる（割り込み時に使う） */
export interface TwilioClearOutbound {
  event: "clear";
  streamSid: string;
}
