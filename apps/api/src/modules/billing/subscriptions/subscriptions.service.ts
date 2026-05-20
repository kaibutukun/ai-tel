import { Injectable } from "@nestjs/common";

const MOCK_SUBSCRIPTION = {
  id: "sub_1",
  companyId: "cmp_1",
  plan: {
    name: "Business",
    type: "BUSINESS",
    priceMonthly: 29800,
    maxPhoneNumbers: 3,
    maxMinutesPerMonth: 500,
  },
  status: "ACTIVE",
  currentPeriodStart: "2024-03-01T00:00:00.000Z",
  currentPeriodEnd: "2024-03-31T00:00:00.000Z",
  cancelAtPeriodEnd: false,
};

@Injectable()
export class SubscriptionsService {
  findCurrent() {
    return { data: MOCK_SUBSCRIPTION };
  }
}
