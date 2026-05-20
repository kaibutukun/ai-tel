import { Injectable, Logger } from "@nestjs/common";

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class NttCpaasClient {
  private readonly logger = new Logger(NttCpaasClient.name);

  async createDialog(parentCallId: string, childCallRequest: UnknownRecord) {
    await this.callNttCpaasApi("/calls/1/dialogs", {
      method: "POST",
      body: JSON.stringify({ parentCallId, childCallRequest }),
    });
  }

  async hangupCall(callId: string) {
    try {
      await this.callNttCpaasApi(
        `/calls/1/calls/${encodeURIComponent(callId)}/hangup`,
        { method: "POST" }
      );
    } catch (err) {
      this.logger.warn(`Failed to hang up call ${callId}: ${(err as Error).message}`);
    }
  }

  private async callNttCpaasApi(path: string, init: RequestInit = {}) {
    const apiKey = process.env.NTT_CPAAS_API_KEY;
    if (!apiKey) throw new Error("NTT_CPAAS_API_KEY is not set");

    const baseUrl = (process.env.NTT_CPAAS_API_BASE_URL ?? "https://api.infobip.com").replace(
      /\/$/,
      ""
    );
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
