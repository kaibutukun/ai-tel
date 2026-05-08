import { Injectable } from "@nestjs/common";

const MOCK_FAQS = [
  {
    id: "faq_1",
    category: "予約",
    question: "予約はどのようにすればよいですか？",
    answer: "お電話またはウェブサイトからご予約いただけます。",
    priority: 1,
    isActive: true,
  },
  {
    id: "faq_2",
    category: "営業時間",
    question: "営業時間を教えてください。",
    answer: "平日9:00〜18:00、土曜10:00〜17:00です。日祝はお休みです。",
    priority: 2,
    isActive: true,
  },
  {
    id: "faq_3",
    category: "キャンセル",
    question: "キャンセルポリシーを教えてください。",
    answer: "前日までのキャンセルは無料です。当日キャンセルはキャンセル料が発生します。",
    priority: 3,
    isActive: true,
  },
  {
    id: "faq_4",
    category: "支払い",
    question: "支払い方法は何がありますか？",
    answer: "現金・クレジットカード・電子マネーがご利用いただけます。",
    priority: 4,
    isActive: false,
  },
];

@Injectable()
export class FaqsService {
  findAll() {
    return { data: MOCK_FAQS, meta: { total: MOCK_FAQS.length } };
  }

  findOne(id: string) {
    return { data: MOCK_FAQS.find((f) => f.id === id) || MOCK_FAQS[0] };
  }
}
