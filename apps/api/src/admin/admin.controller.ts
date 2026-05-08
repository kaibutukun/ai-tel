import { Controller, Get, Param } from "@nestjs/common";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get("companies")
  findAllCompanies() {
    return this.service.findAllCompanies();
  }

  @Get("companies/:id")
  findCompany(@Param("id") id: string) {
    return this.service.findCompany(id);
  }
}
