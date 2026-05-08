import { Injectable } from "@nestjs/common";

const MOCK_SESSIONS = [
  {
    id: "cs_1",
    callerNumber: "090-1111-0001",
    callFlowName: "標準対応フロー",
    category: "問い合わせ",
    result: "AI_RESOLVED",
    durationSeconds: 145,
    isAiHandled: true,
    callbackNeeded: false,
    startedAt: "2024-03-15T09:15:00.000Z",
  },
  {
    id: "cs_2",
    callerNumber: "080-2222-0002",
    callFlowName: "予約受付フロー",
    category: "予約",
    result: "CALLBACK_REQUESTED",
    durationSeconds: 210,
    isAiHandled: true,
    callbackNeeded: true,
    startedAt: "2024-03-15T10:30:00.000Z",
  },
  {
    id: "cs_3",
    callerNumber: "03-3333-0003",
    callFlowName: "標準対応フロー",
    category: "クレーム",
    result: "TRANSFERRED",
    durationSeconds: 320,
    isAiHandled: false,
    callbackNeeded: false,
    startedAt: "2024-03-15T11:45:00.000Z",
  },
];

const MOCK_SESSION_DETAIL = {
  id: "cs_1",
  callerNumber: "090-1111-0001",
  callFlowName: "標準対応フロー",
  category: "問い合わせ",
  result: "AI_RESOLVED",
  durationSeconds: 145,
  isAiHandled: true,
  callbackNeeded: false,
  startedAt: "2024-03-15T09:15:00.000Z",
  recordingUrl: "https://storage.example.com/recordings/cs_1.mp3",
  transcripts: [
    { speaker: "AI", content: "お電話ありがとうございます。ご用件をお聞かせください。", timestamp: 0 },
    { speaker: "CALLER", content: "営業時間を教えてください。", timestamp: 5.2 },
    { speaker: "AI", content: "平日9時から18時、土曜は10時から17時となっております。", timestamp: 8.1 },
    { speaker: "CALLER", content: "ありがとうございます。", timestamp: 12.5 },
  ],
  summary: "発信者は営業時間について問い合わせ。AIが正確な情報を提供し、問題を解決しました。",
  extractedData: { inquiryType: "営業時間確認" },
  usedFaqs: ["営業時間を教えてください。"],
  usedDocuments: [],
  operatorNote: null,
};

@Injectable()
export class CallSessionsService {
  findAll() {
    return { data: MOCK_SESSIONS, meta: { total: MOCK_SESSIONS.length } };
  }

  findOne(id: string) {
    return { data: MOCK_SESSION_DETAIL };
  }
}
