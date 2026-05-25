import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../../database/prisma.module";
import { AdminCompaniesController } from "./admin-companies.controller";
import { AdminCompaniesService } from "./admin-companies.service";

@Module({
  imports: [DatabaseModule],
  controllers: [AdminCompaniesController],
  providers: [AdminCompaniesService],
})
export class AdminCompaniesModule {}
