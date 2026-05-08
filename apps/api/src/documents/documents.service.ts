import { Injectable } from "@nestjs/common";

const MOCK_DOCUMENTS = [
  {
    id: "doc_1",
    name: "サービス案内.pdf",
    type: "PDF",
    status: "AVAILABLE",
    usedInFlows: ["標準対応フロー"],
    updatedAt: "2024-03-01T00:00:00.000Z",
  },
  {
    id: "doc_2",
    name: "よくある質問まとめ",
    type: "TEXT",
    status: "AVAILABLE",
    usedInFlows: ["標準対応フロー", "予約受付フロー"],
    updatedAt: "2024-03-10T00:00:00.000Z",
  },
  {
    id: "doc_3",
    name: "https://example.com/menu",
    type: "URL",
    status: "PROCESSING",
    usedInFlows: [],
    updatedAt: "2024-03-15T00:00:00.000Z",
  },
];

@Injectable()
export class DocumentsService {
  findAll() {
    return { data: MOCK_DOCUMENTS, meta: { total: MOCK_DOCUMENTS.length } };
  }

  findOne(id: string) {
    return { data: MOCK_DOCUMENTS.find((d) => d.id === id) || MOCK_DOCUMENTS[0] };
  }
}
