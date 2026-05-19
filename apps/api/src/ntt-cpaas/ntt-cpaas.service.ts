import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type UnknownRecord = Record<string, unknown>;

export type NttCpaasEvent = UnknownRecord & {
  type?: string;
  callId?: string;
  from?: unknown;
  to?: unknown;
  timestamp?: string;
  properties?: UnknownRecord;
};

@Injectable()
export class NttCpaasService {
  private readonly logger = new Logger(NttCpaasService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleEvents(events: NttCpaasEvent[]) {
    const results = [];
    for (const event of events) {
      results.push(await this.handleEvent(event));
    }
    return { data: { received: events.length, results } };
  }

  private async handleEvent(event: NttCpaasEvent) {
    const type = event.type;
    if (!type) return { handled: false, reason: "missing_type" };

    switch (type) {
      case "CALL_RECEIVED":
        return this.handleCallReceived(event);
      case "CALL_FINISHED":
      case "CALL_FAILED":
        return this.handleCallEnded(event);
      default:
        return { handled: false, type };
    }
  }

  private async handleCallReceived(event: NttCpaasEvent) {
    const callId = event.callId;
    const to = this.extractPhoneNumber(event.to);
    const from = this.extractPhoneNumber(event.from);

    if (!callId) return { handled: false, reason: "missing_call_id" };
    if (!to) {
      await this.hangupCall(callId);
      return { handled: false, reason: "missing_destination" };
    }

    const phoneNumber = await this.findPhoneNumberByProviderValue(to);
    if (!phoneNumber?.companyId) {
      await this.hangupCall(callId);
      return { handled: false, reason: "unregistered_or_unassigned_number", callId };
    }

    const session = await this.createOrUpdateCallSession({
      providerCallId: callId,
      companyId: phoneNumber.companyId,
      phoneNumberId: phoneNumber.id,
      callFlowId: phoneNumber.callFlowId,
      callerNumber: from,
    });

    if (!phoneNumber.isActive) {
      await this.hangupCall(callId);
      return { handled: true, action: "hangup_inactive", callId };
    }

    if (phoneNumber.transferTo && !phoneNumber.callFlowId) {
      await this.createDialog(callId, {
        endpoint: { type: "PHONE", phoneNumber: phoneNumber.transferTo },
        from: phoneNumber.number,
      });
      return { handled: true, action: "transfer", callId };
    }

    const websocketEndpointConfigId = process.env.NTT_CPAAS_WEBSOCKET_ENDPOINT_CONFIG_ID;
    if (!websocketEndpointConfigId) {
      this.logger.error("NTT_CPAAS_WEBSOCKET_ENDPOINT_CONFIG_ID is not set");
      await this.hangupCall(callId);
      return { handled: false, reason: "missing_websocket_endpoint_config", callId };
    }

    await this.createDialog(callId, {
      endpoint: {
        type: "WEBSOCKET",
        websocketEndpointConfigId,
        customData: {
          callId,
          callSessionId: session.id,
          phoneNumberId: phoneNumber.id,
          companyId: phoneNumber.companyId,
          flowId: phoneNumber.callFlowId ?? "",
        },
      },
    });

    return { handled: true, action: "ai_dialog", callId };
  }

  private async handleCallEnded(event: NttCpaasEvent) {
    const callId = event.callId;
    if (!callId) return { handled: false, reason: "missing_call_id" };

    const session = await this.prisma.callSession.findFirst({
      where: { providerCallId: callId },
      include: { phoneNumber: { select: { transferTo: true } } },
    });
    if (!session) return { handled: false, reason: "session_not_found", callId };

    const endedAt = new Date();
    const durationSeconds =
      this.extractDurationSeconds(event) ?? this.computeDurationSeconds(session.startedAt, endedAt);
    await this.prisma.callSession.update({
      where: { id: session.id },
      data: {
        endedAt,
        durationSeconds,
        result: this.mapCallResult(event.type, Boolean(session.phoneNumber?.transferTo)),
      },
    });

    return { handled: true, action: "updated_session", callId };
  }

  private async createOrUpdateCallSession(params: {
    providerCallId: string;
    companyId: string;
    phoneNumberId: string;
    callFlowId?: string | null;
    callerNumber?: string;
  }) {
    const existing = await this.prisma.callSession.findFirst({
      where: { providerCallId: params.providerCallId },
      select: { id: true },
    });

    if (!existing) {
      return this.prisma.callSession.create({
        data: {
          companyId: params.companyId,
          phoneNumberId: params.phoneNumberId,
          callFlowId: params.callFlowId,
          providerCallId: params.providerCallId,
          callerNumber: params.callerNumber,
          startedAt: new Date(),
        },
        select: { id: true },
      });
    }

    return this.prisma.callSession.update({
      where: { id: existing.id },
      data: {
        companyId: params.companyId,
        phoneNumberId: params.phoneNumberId,
        callFlowId: params.callFlowId,
        callerNumber: params.callerNumber,
      },
      select: { id: true },
    });
  }

  private async findPhoneNumberByProviderValue(value: string) {
    const normalized = this.normalizeProviderPhoneNumber(value);
    const candidates = Array.from(new Set([value, normalized, normalized.replace(/^\+/, "")]));
    return this.prisma.phoneNumber.findFirst({
      where: { OR: candidates.map((number) => ({ number })) },
      include: { callFlow: { select: { id: true, name: true } } },
    });
  }

  private extractPhoneNumber(value: unknown): string | undefined {
    if (typeof value === "string") return this.normalizeProviderPhoneNumber(value);
    if (!value || typeof value !== "object") return undefined;

    const record = value as UnknownRecord;
    const candidate =
      record.phoneNumber ??
      record.number ??
      record.address ??
      record.identity ??
      record.value;
    return typeof candidate === "string"
      ? this.normalizeProviderPhoneNumber(candidate)
      : undefined;
  }

  private normalizeProviderPhoneNumber(value: string) {
    const stripped = value.replace(/[\s\-()]/g, "");
    if (stripped.startsWith("+")) return stripped;
    if (/^[1-9]\d{1,14}$/.test(stripped)) return `+${stripped}`;
    return stripped;
  }

  private extractDurationSeconds(event: NttCpaasEvent) {
    const raw =
      event.duration ??
      event.properties?.duration ??
      event.properties?.durationSeconds ??
      event.properties?.callDuration;
    if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
    if (typeof raw === "string") {
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  private computeDurationSeconds(startedAt: Date, endedAt: Date) {
    return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
  }

  private mapCallResult(eventType: string | undefined, transferred: boolean) {
    if (eventType === "CALL_FAILED") return "NO_ANSWER" as const;
    return transferred ? ("TRANSFERRED" as const) : ("AI_RESOLVED" as const);
  }

  private async createDialog(parentCallId: string, childCallRequest: UnknownRecord) {
    await this.callNttCpaasApi("/calls/1/dialogs", {
      method: "POST",
      body: JSON.stringify({ parentCallId, childCallRequest }),
    });
  }

  private async hangupCall(callId: string) {
    try {
      await this.callNttCpaasApi(`/calls/1/calls/${encodeURIComponent(callId)}/hangup`, {
        method: "POST",
      });
    } catch (err) {
      this.logger.warn(`Failed to hang up call ${callId}: ${(err as Error).message}`);
    }
  }

  private async callNttCpaasApi(path: string, init: RequestInit = {}) {
    const apiKey = process.env.NTT_CPAAS_API_KEY;
    if (!apiKey) throw new Error("NTT_CPAAS_API_KEY is not set");

    const baseUrl = (process.env.NTT_CPAAS_API_BASE_URL ?? "https://api.infobip.com").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `App ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init.headers,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`NTT CPaaS API ${response.status} ${response.statusText}: ${body}`);
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
}
