import { Body, Controller, HttpCode, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { Public } from "../common/guards/jwt-auth.guard";
import { TwilioService } from "./twilio.service";

type TwilioFormBody = Record<string, string | undefined>;

/**
 * Twilio から直接呼ばれる webhook。
 * Twilio は application/x-www-form-urlencoded で送信するため、DTO検証ではなく生の body を受け取る。
 */
@Public()
@Controller("twilio")
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  /** Twilio 番号の Voice webhook に設定するURL: POST /api/twilio/voice */
  @HttpCode(200)
  @Post("voice")
  async voice(
    @Body() body: TwilioFormBody,
    @Req() req: Request,
    @Res() res: Response
  ) {
    this.twilioService.assertValidRequest(req, body);
    const xml = await this.twilioService.buildIncomingVoiceResponse(body);
    res.type("text/xml").send(xml);
  }

  /** Twilio 番号の Status Callback URL に設定するURL: POST /api/twilio/status */
  @HttpCode(200)
  @Post("status")
  async status(@Body() body: TwilioFormBody, @Req() req: Request) {
    this.twilioService.assertValidRequest(req, body);
    return this.twilioService.handleStatusCallback(body);
  }
}
