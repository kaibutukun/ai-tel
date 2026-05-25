import { Injectable } from "@nestjs/common";

const MOCK_SUBSCRIPTION = {
  id: "sub_1",
  companyId: "cmp_1",
  plan: { name: "有料会員", type: "PAID" },
  monthlyPrice: 29800,
  maxMinutesPerMonth: 500,
  trialEndsAt: null,
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
