import { Controller, Get, Param } from "@nestjs/common";
import { PhoneNumbersService } from "./phone-numbers.service";

@Controller("phone-numbers")
export class PhoneNumbersController {
  constructor(private readonly service: PhoneNumbersService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
