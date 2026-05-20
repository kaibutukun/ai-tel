import { FlowEditPage } from "@/features/call-flows/editor/pages/FlowEditPage";

export default function Page({ params }: { params: { id: string } }) {
  return <FlowEditPage id={params.id} />;
}
