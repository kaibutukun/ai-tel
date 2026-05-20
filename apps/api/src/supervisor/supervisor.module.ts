import { Module } from "@nestjs/common";
import { SupervisorService } from "./supervisor.service";

@Module({
  providers: [SupervisorService],
  exports: [SupervisorService],
})
export class SupervisorModule {}
