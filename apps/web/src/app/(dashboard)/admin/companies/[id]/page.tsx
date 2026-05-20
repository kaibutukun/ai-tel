import { AdminCompanyDetailPage } from "@/features/admin/pages/AdminCompanyDetailPage";

export default function Page({ params }: { params: { id: string } }) {
  return <AdminCompanyDetailPage id={params.id} />;
}
