import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Public } from "../../../common/decorators/public.decorator";
import {
  NttCpaasEvent,
  NttCpaasWebhookService,
} from "./ntt-cpaas-webhook.service";

/**
 * NTT CPaaS / Infobip Calls API から直接呼ばれる webhook。
 * Subscription Management の notification profile に設定する URL:
 * POST /api/ntt-cpaas/events
 */
@Public()
@Controller("ntt-cpaas")
export class NttCpaasWebhookController {
  constructor(private readonly nttCpaasService: NttCpaasWebhookService) {}

  @HttpCode(200)
  @Post("events")
  async events(
    @Body() body: NttCpaasEvent | NttCpaasEvent[] | { results?: NttCpaasEvent[]; events?: NttCpaasEvent[] }
  ) {
    const events = Array.isArray(body)
      ? body
      : Array.isArray(body.results)
        ? body.results
        : Array.isArray(body.events)
          ? body.events
          : [body as NttCpaasEvent];
    return this.nttCpaasService.handleEvents(events);
  }
}
