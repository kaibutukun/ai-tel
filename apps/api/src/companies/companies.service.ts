import { Injectable } from "@nestjs/common";

const MOCK_COMPANIES = [
  {
    id: "cmp_1",
    name: "株式会社サンプル",
    slug: "sample",
    industry: "小売業",
    isActive: true,
    phoneMain: "03-1234-5678",
    createdAt: "2024-01-15T00:00:00.000Z",
  },
  {
    id: "cmp_2",
    name: "テスト歯科クリニック",
    slug: "test-dental",
    industry: "医療",
    isActive: true,
    phoneMain: "06-9876-5432",
    createdAt: "2024-02-01T00:00:00.000Z",
  },
];

@Injectable()
export class CompaniesService {
  findAll() {
    return { data: MOCK_COMPANIES, meta: { total: MOCK_COMPANIES.length } };
  }

  findOne(id: string) {
    return { data: MOCK_COMPANIES.find((c) => c.id === id) || MOCK_COMPANIES[0] };
  }
}
