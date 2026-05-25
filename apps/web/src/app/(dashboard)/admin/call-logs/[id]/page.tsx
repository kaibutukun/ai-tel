import { AdminCallLogDetailPage } from "@/features/admin/pages/AdminCallLogDetailPage";

export default function Page({ params }: { params: { id: string } }) {
  return <AdminCallLogDetailPage id={params.id} />;
}
