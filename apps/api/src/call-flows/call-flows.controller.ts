import { Controller, Get, Param } from "@nestjs/common";
import { CallFlowsService } from "./call-flows.service";

@Controller("call-flows")
export class CallFlowsController {
  constructor(private readonly service: CallFlowsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
