"use client";

import { Header } from "@/shared/layout/header";
import { CallControls } from "../components/CallControls";
import { CallLogPanel } from "../components/CallLogPanel";
import { ConnectionInfo } from "../components/ConnectionInfo";
import { getDevCallWsUrl } from "../lib/dev-call-url";
import { useDevCall } from "../hooks/useDevCall";

export function CallTestPage() {
  const { state, actions } = useDevCall();

  return (
    <>
      <Header title="通話テスト" />
      <main className="flex-1 p-6 space-y-6">
        <CallControls
          companyId={state.companyId}
          flows={state.flows}
          phoneNumbers={state.phoneNumbers}
          selectedFlowId={state.selectedFlowId}
          selectedPhoneNumberId={state.selectedPhoneNumberId}
          status={state.status}
          statusLabel={state.statusLabel}
          muted={state.muted}
          connected={state.connected}
          loadingSettings={state.loadingSettings}
          onFlowChange={actions.setSelectedFlowId}
          onPhoneNumberChange={actions.setSelectedPhoneNumberId}
          onReload={() => void actions.reloadSettings()}
          onToggleMuted={actions.toggleMuted}
          onStart={() => void actions.startCall()}
          onEnd={actions.endCall}
        />

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <CallLogPanel logs={state.logs} />
          <ConnectionInfo companyId={state.companyId} wsUrl={getDevCallWsUrl()} />
        </section>
      </main>
    </>
  );
}
