import { Controller, Get, Param } from "@nestjs/common";
import { FaqsService } from "./faqs.service";

@Controller("faqs")
export class FaqsController {
  constructor(private readonly service: FaqsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
