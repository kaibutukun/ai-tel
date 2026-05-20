import { Module } from "@nestjs/common";
import { CallFlowsModule } from "./call-flows/call-flows.module";
import { CallSessionsModule } from "./call-sessions/call-sessions.module";
import { NttCpaasModule } from "./cpaas/ntt-cpaas.module";
import { PhoneNumbersModule } from "./phone-numbers/phone-numbers.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    PhoneNumbersModule,
    CallFlowsModule,
    CallSessionsModule,
    NttCpaasModule,
    RealtimeModule,
  ],
  exports: [RealtimeModule],
})
export class VoiceModule {}
