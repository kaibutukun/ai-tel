import { Injectable } from "@nestjs/common";

const MOCK_ADMIN_COMPANIES = [
  {
    id: "cmp_1",
    name: "株式会社サンプル",
    plan: "Business",
    priceMonthly: 29800,
    callsThisMonth: 342,
    minutesThisMonth: 287,
    phoneNumbersCount: 2,
    billingStatus: "PAID",
    isActive: true,
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "cmp_2",
    name: "テスト歯科クリニック",
    plan: "Starter",
    priceMonthly: 9800,
    callsThisMonth: 98,
    minutesThisMonth: 76,
    phoneNumbersCount: 1,
    billingStatus: "PAID",
    isActive: true,
    createdAt: "2024-02-01T00:00:00.000Z",
  },
  {
    id: "cmp_3",
    name: "停止中商事",
    plan: "Trial",
    priceMonthly: 0,
    callsThisMonth: 0,
    minutesThisMonth: 0,
    phoneNumbersCount: 0,
    billingStatus: "NONE",
    isActive: false,
    createdAt: "2024-03-01T00:00:00.000Z",
  },
];

@Injectable()
export class AdminService {
  findAllCompanies() {
    return {
      data: MOCK_ADMIN_COMPANIES,
      meta: { total: MOCK_ADMIN_COMPANIES.length },
      stats: {
        totalCompanies: MOCK_ADMIN_COMPANIES.length,
        activeCompanies: MOCK_ADMIN_COMPANIES.filter((c) => c.isActive).length,
        totalMRR: MOCK_ADMIN_COMPANIES.reduce((sum, c) => sum + c.priceMonthly, 0),
      },
    };
  }

  findCompany(id: string) {
    const company = MOCK_ADMIN_COMPANIES.find((c) => c.id === id) || MOCK_ADMIN_COMPANIES[0];
    return {
      data: {
        ...company,
        adminNotes: "2024年1月から契約。安定利用中。",
        invoiceHistory: [
          { month: "2024-03", total: 29800, status: "PAID" },
          { month: "2024-02", total: 29800, status: "PAID" },
          { month: "2024-01", total: 29800, status: "PAID" },
        ],
      },
    };
  }
}
