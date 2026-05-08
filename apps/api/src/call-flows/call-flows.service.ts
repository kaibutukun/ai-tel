import { Injectable } from "@nestjs/common";

const MOCK_CALL_FLOWS = [
  {
    id: "cf_1",
    name: "標準対応フロー",
    description: "汎用的な電話対応フロー",
    status: "PUBLISHED",
    updatedAt: "2024-03-01T00:00:00.000Z",
    stepsCount: 5,
  },
  {
    id: "cf_2",
    name: "予約受付フロー",
    description: "予約専用の対応フロー",
    status: "PUBLISHED",
    updatedAt: "2024-03-10T00:00:00.000Z",
    stepsCount: 3,
  },
  {
    id: "cf_3",
    name: "クレーム対応フロー",
    description: "クレーム専用（下書き）",
    status: "DRAFT",
    updatedAt: "2024-03-15T00:00:00.000Z",
    stepsCount: 4,
  },
];

const MOCK_FLOW_DETAIL = {
  id: "cf_1",
  name: "標準対応フロー",
  greeting: "お電話ありがとうございます。AIアシスタントのアイテルです。ご用件をお聞かせください。",
  status: "PUBLISHED",
  steps: [
    {
      id: "step_1",
      order: 1,
      category: "予約",
      responseMethod: "必要項目を聞き取って折り返し受付",
      fieldsToCollect: ["お名前", "ご連絡先", "希望日時"],
      useRag: false,
      transferCondition: null,
      notificationTarget: "staff@example.com",
    },
    {
      id: "step_2",
      order: 2,
      category: "問い合わせ",
      responseMethod: "FAQで回答",
      fieldsToCollect: [],
      useRag: true,
      transferCondition: "回答できない場合",
      notificationTarget: null,
    },
    {
      id: "step_3",
      order: 3,
      category: "担当者取次",
      responseMethod: "担当者に転送",
      fieldsToCollect: ["お名前", "会社名"],
      useRag: false,
      transferCondition: null,
      notificationTarget: "090-1111-2222",
    },
    {
      id: "step_4",
      order: 4,
      category: "クレーム",
      responseMethod: "担当者に転送",
      fieldsToCollect: ["お名前", "ご連絡先", "内容"],
      useRag: false,
      transferCondition: null,
      notificationTarget: "manager@example.com",
    },
    {
      id: "step_5",
      order: 5,
      category: "その他",
      responseMethod: "必要項目を聞き取って折り返し受付",
      fieldsToCollect: ["お名前", "ご連絡先", "ご用件"],
      useRag: false,
      transferCondition: null,
      notificationTarget: null,
    },
  ],
  endMessage: "お電話ありがとうございました。またのご連絡をお待ちしております。",
};

@Injectable()
export class CallFlowsService {
  findAll() {
    return { data: MOCK_CALL_FLOWS, meta: { total: MOCK_CALL_FLOWS.length } };
  }

  findOne(id: string) {
    return { data: MOCK_FLOW_DETAIL };
  }
}
