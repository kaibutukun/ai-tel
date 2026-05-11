import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { Request } from "express";
import * as twilio from "twilio";
import { PrismaService } from "../prisma/prisma.service";

type TwilioFormBody = Record<string, string | undefined>;

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Twilio 署名を検証する。
   * ローカル検証や初期導入を楽にするため、TWILIO_VALIDATE_REQUESTS=true の時だけ必須にしている。
   */
  assertValidRequest(req: Request, body: TwilioFormBody) {
    if (process.env.TWILIO_VALIDATE_REQUESTS !== "true") return;

    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const signature = req.header("x-twilio-signature");
    if (!authToken || !signature) {
      throw new ForbiddenException("Twilio request signature is missing");
    }

    const url = this.getPublicWebhookUrl(req);
    const isValid = twilio.validateRequest(authToken, signature, url, body);
    if (!isValid) {
      this.logger.warn(`Invalid Twilio signature for ${url}`);
      throw new ForbiddenException("Invalid Twilio request signature");
    }
  }

  /**
   * 着信時に Twilio へ返す TwiML を組み立てる。
   * 現時点では「番号設定に応じた音声応答・任意転送」までを担当し、AI 会話実行は次段階で接続する。
   */
  async buildIncomingVoiceResponse(body: TwilioFormBody): Promise<string> {
    const response = new twilio.twiml.VoiceResponse();
    const to = body.To;
    const from = body.From;
    const callSid = body.CallSid;

    if (!to) {
      response.say({ language: "ja-JP" }, "電話番号を確認できませんでした。");
      response.hangup();
      return response.toString();
    }

    const phoneNumber = await this.prisma.phoneNumber.findUnique({
      where: { number: to },
      include: { callFlow: { select: { id: true, name: true } } },
    });

    if (!phoneNumber) {
      response.say({ language: "ja-JP" }, "この電話番号は現在サービスに登録されていません。");
      response.hangup();
      return response.toString();
    }

    await this.createOrUpdateCallSession({
      callSid,
      companyId: phoneNumber.companyId,
      phoneNumberId: phoneNumber.id,
      callFlowId: phoneNumber.callFlowId,
      callerNumber: from,
    });

    if (!phoneNumber.isActive) {
      response.say({ language: "ja-JP" }, "ただいまこの電話番号での受付は停止しています。");
      response.hangup();
      return response.toString();
    }

    if (phoneNumber.transferTo) {
      response.say({ language: "ja-JP" }, "お電話ありがとうございます。担当者におつなぎします。");
      response.dial({ callerId: phoneNumber.number }, phoneNumber.transferTo);
      return response.toString();
    }

    const flowName = phoneNumber.callFlow?.name;
    response.say(
      { language: "ja-JP" },
      flowName
        ? `お電話ありがとうございます。${flowName}で受付しました。現在、AI応答の接続準備中です。`
        : "お電話ありがとうございます。現在、AI応答の接続準備中です。"
    );
    response.hangup();
    return response.toString();
  }

  /**
   * Twilio の status callback を通話ログへ反映する。
   * Console 側で Status Callback URL を設定すると、通話終了時刻と秒数が保存される。
   */
  async handleStatusCallback(body: TwilioFormBody) {
    const callSid = body.CallSid;
    if (!callSid) return { data: { updated: false } };

    const durationSeconds = body.CallDuration
      ? Number.parseInt(body.CallDuration, 10)
      : undefined;
    const endedAt = body.CallStatus === "completed" ? new Date() : undefined;

    const session = await this.prisma.callSession.findFirst({
      where: { twilioCallSid: callSid },
      include: { phoneNumber: { select: { transferTo: true } } },
    });
    if (!session) return { data: { updated: false } };

    await this.prisma.callSession.update({
      where: { id: session.id },
      data: {
        endedAt,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
        result: this.mapCallResult(body.CallStatus, Boolean(session.phoneNumber?.transferTo)),
      },
    });

    return { data: { updated: true } };
  }

  private async createOrUpdateCallSession(params: {
    callSid?: string;
    companyId: string;
    phoneNumberId: string;
    callFlowId?: string | null;
    callerNumber?: string;
  }) {
    if (!params.callSid) {
      await this.prisma.callSession.create({
        data: {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
          callFlowId: params.callFlowId,
          callerNumber: params.callerNumber,
          startedAt: new Date(),
        },
      });
      return;
    }

    const existing = await this.prisma.callSession.findFirst({
      where: { twilioCallSid: params.callSid },
      select: { id: true },
    });

    if (!existing) {
      await this.prisma.callSession.create({
        data: {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
          callFlowId: params.callFlowId,
          twilioCallSid: params.callSid,
          callerNumber: params.callerNumber,
          startedAt: new Date(),
        },
      });
      return;
    }

    await this.prisma.callSession.update({
      where: { id: existing.id },
      data: {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
        callFlowId: params.callFlowId,
        callerNumber: params.callerNumber,
      },
    });
  }

  private mapCallResult(callStatus: string | undefined, transferred: boolean) {
    if (["busy", "failed", "no-answer", "canceled"].includes(callStatus ?? "")) {
      return "NO_ANSWER" as const;
    }
    return transferred ? ("TRANSFERRED" as const) : ("AI_RESOLVED" as const);
  }

  private getPublicWebhookUrl(req: Request) {
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
    if (baseUrl) return `${baseUrl}${req.originalUrl}`;

    // ngrok 等のプロキシ経由でも Twilio が見た URL に近づけるため forwarded proto を優先する。
    const forwardedProto = req.header("x-forwarded-proto");
    const protocol = forwardedProto ?? req.protocol;
    return `${protocol}://${req.get("host")}${req.originalUrl}`;
  }
}
