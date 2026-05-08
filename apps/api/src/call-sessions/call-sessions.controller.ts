import { Controller, Get, Param } from "@nestjs/common";
import { CallSessionsService } from "./call-sessions.service";

@Controller("call-sessions")
export class CallSessionsController {
  constructor(private readonly service: CallSessionsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.service.findOne(id);
  }
}
