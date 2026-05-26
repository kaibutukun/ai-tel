import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { IdentityModule } from "../../identity/identity.module";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
