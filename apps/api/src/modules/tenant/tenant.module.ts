import { Module } from "@nestjs/common";
import { CompaniesModule } from "./companies/companies.module";
import { MembersModule } from "./members/members.module";

@Module({
  imports: [CompaniesModule, MembersModule],
})
export class TenantModule {}
