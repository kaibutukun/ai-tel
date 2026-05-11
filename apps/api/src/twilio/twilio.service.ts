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
   *
   * AI 応答を有効化したフェーズでは、TwiML で `<Connect><Stream>` を返し、
   * Twilio の Media Streams を WebSocket でこのサーバー (RealtimeService) に
   * 中継させる。実際の会話制御は RealtimeBridge が OpenAI Realtime API
   * と直結して行う。
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

    if (!phoneNumber.companyId) {
      response.say({ language: "ja-JP" }, "この電話番号は現在どの会社にも割り当てられていません。");
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

    // フローが設定されていない or 強制的に転送先が指定されている場合は従来通り転送。
    // （AI を介さず直結したい番号はこちらの分岐を使う想定）
    if (phoneNumber.transferTo && !phoneNumber.callFlowId) {
      response.say({ language: "ja-JP" }, "お電話ありがとうございます。担当者におつなぎします。");
      response.dial({ callerId: phoneNumber.number }, phoneNumber.transferTo);
      return response.toString();
    }

    // ────────── AI 応答経路 ──────────
    // Twilio Media Streams をこのサーバーへ繋ぎ、OpenAI Realtime と双方向音声する。
    const wsUrl = this.buildMediaStreamUrl(phoneNumber.id, callSid);
    if (!wsUrl) {
      // 公開 WSS URL が解決できない場合は安全側に倒して案内アナウンスのみ
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

    const connect = response.connect();
    const stream = connect.stream({ url: wsUrl });
    // <Stream> の Parameter として番号ID等を渡す（クエリ取得失敗時のフォールバック）
    stream.parameter({ name: "phoneNumberId", value: phoneNumber.id });
    if (phoneNumber.companyId) stream.parameter({ name: "companyId", value: phoneNumber.companyId });
    if (phoneNumber.callFlowId) stream.parameter({ name: "flowId", value: phoneNumber.callFlowId });
    if (callSid) stream.parameter({ name: "callSid", value: callSid });
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

  /**
   * Twilio Media Streams の <Stream url="..."> に渡す WebSocket URL を組み立てる。
   * TWILIO_WEBHOOK_BASE_URL (https://...) を wss:// に置換し、media-stream パスを足す。
   * 環境変数が未設定の場合は null を返す（呼び出し側で別経路へフォールバック）。
   */
  private buildMediaStreamUrl(phoneNumberId: string, callSid?: string): string | null {
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL?.replace(/\/$/, "");
    if (!baseUrl) return null;
    const wsBase = baseUrl
      .replace(/^http:\/\//i, "ws://")
      .replace(/^https:\/\//i, "wss://");

    const params = new URLSearchParams();
    params.set("phoneNumberId", phoneNumberId);
    if (callSid) params.set("callSid", callSid);
    return `${wsBase}/twilio/media-stream?${params.toString()}`;
  }
}
