import { CallLogDetailPage } from "@/features/call-logs/pages/CallLogDetailPage";

export default function Page({ params }: { params: { id: string } }) {
  return <CallLogDetailPage id={params.id} />;
}
