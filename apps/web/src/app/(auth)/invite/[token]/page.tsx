import { InvitePage } from "@/features/invite/pages/InvitePage";

export default function Page({ params }: { params: { token: string } }) {
  return <InvitePage token={params.token} />;
}
