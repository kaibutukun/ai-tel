import { Controller, Get } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";

@Controller("subscriptions")
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  findCurrent() {
    return this.service.findCurrent();
  }
}
