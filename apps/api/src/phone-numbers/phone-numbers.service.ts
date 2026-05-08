import { Injectable } from "@nestjs/common";

const MOCK_PHONE_NUMBERS = [
  {
    id: "pn_1",
    number: "050-1234-5678",
    displayName: "代表回線",
    callFlowId: "cf_1",
    callFlowName: "標準対応フロー",
    transferTo: "090-1111-2222",
    isActive: true,
    businessHours: "平日 9:00-18:00",
  },
  {
    id: "pn_2",
    number: "050-9876-5432",
    displayName: "予約専用",
    callFlowId: "cf_2",
    callFlowName: "予約受付フロー",
    transferTo: null,
    isActive: true,
    businessHours: "毎日 10:00-20:00",
  },
];

@Injectable()
export class PhoneNumbersService {
  findAll() {
    return { data: MOCK_PHONE_NUMBERS, meta: { total: MOCK_PHONE_NUMBERS.length } };
  }

  findOne(id: string) {
    return { data: MOCK_PHONE_NUMBERS.find((p) => p.id === id) || MOCK_PHONE_NUMBERS[0] };
  }
}
