import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { InvitationsModule } from "./invitations/invitations.module";

@Module({
  imports: [AuthModule, InvitationsModule],
  exports: [InvitationsModule],
})
export class IdentityModule {}
