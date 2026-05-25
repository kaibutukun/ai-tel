import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { AdminCallSessionsController } from "./admin-call-sessions.controller";
import { AdminCallSessionsService } from "./admin-call-sessions.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminCallSessionsController],
  providers: [AdminCallSessionsService],
})
export class AdminCallSessionsModule {}
