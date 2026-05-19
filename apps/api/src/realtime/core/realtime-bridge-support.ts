import { Logger } from "@nestjs/common";

export const NTT_CPAAS_SAMPLE_RATE = 24000;
export const NTT_CPAAS_FRAME_BYTES = 960; // 24kHz * 20ms * 16-bit mono

export class CpaasAudioFramer {
  private outputBuffer = Buffer.alloc(0);

  append(audioBase64: string, sendFrame: (frame: Buffer) => void) {
    const chunk = Buffer.from(audioBase64, "base64");
    if (chunk.length === 0) return;

    this.outputBuffer = Buffer.concat([this.outputBuffer, chunk]);
    while (this.outputBuffer.length >= NTT_CPAAS_FRAME_BYTES) {
      const frame = this.outputBuffer.subarray(0, NTT_CPAAS_FRAME_BYTES);
      this.outputBuffer = this.outputBuffer.subarray(NTT_CPAAS_FRAME_BYTES);
      sendFrame(frame);
    }
  }

  clear() {
    this.outputBuffer = Buffer.alloc(0);
  }
}

export class RealtimeSessionClock {
  private startedAtMs = Date.now();

  restart() {
    this.startedAtMs = Date.now();
  }

  elapsedSeconds() {
    return Math.max(0, (Date.now() - this.startedAtMs) / 1000);
  }

  elapsedWholeSeconds() {
    return Math.max(0, Math.round(this.elapsedSeconds()));
  }
}

export class Pcm16BargeInDetector {
  private consecutiveSpeechFrames = 0;
  private lastInterruptAt = 0;

  private readonly options = {
    rmsThreshold: this.readPositiveNumber("REALTIME_BARGE_IN_RMS_THRESHOLD", 650),
    minConsecutiveFrames: this.readPositiveNumber("REALTIME_BARGE_IN_MIN_FRAMES", 2),
    cooldownMs: this.readPositiveNumber("REALTIME_BARGE_IN_COOLDOWN_MS", 900),
  };

  shouldInterrupt(frame: Buffer, responseActive: boolean) {
    if (!responseActive) {
      this.consecutiveSpeechFrames = 0;
      return false;
    }

    if (Date.now() - this.lastInterruptAt < this.options.cooldownMs) {
      return false;
    }

    if (this.rms(frame) >= this.options.rmsThreshold) {
      this.consecutiveSpeechFrames += 1;
    } else {
      this.consecutiveSpeechFrames = 0;
    }

    if (this.consecutiveSpeechFrames < this.options.minConsecutiveFrames) {
      return false;
    }

    this.lastInterruptAt = Date.now();
    this.consecutiveSpeechFrames = 0;
    return true;
  }

  private rms(frame: Buffer) {
    const samples = Math.floor(frame.length / 2);
    if (samples === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i + 1 < frame.length; i += 2) {
      const sample = frame.readInt16LE(i);
      sumSquares += sample * sample;
    }
    return Math.sqrt(sumSquares / samples);
  }

  private readPositiveNumber(name: string, fallback: number) {
    const raw = process.env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}

export interface RealtimeToolLogContext {
  faqMinScore: number;
  documentMinScore: number;
  transferTo?: string;
  notifyTarget?: string;
}

export function summarizeForLog(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json.length <= 600) return json;
    return `${json.slice(0, 600)}…(+${json.length - 600}chars)`;
  } catch {
    return String(value);
  }
}

export function logToolNodeEntry(
  logger: Logger,
  tag: string,
  toolName: string,
  args: Record<string, unknown>,
  context: RealtimeToolLogContext
) {
  switch (toolName) {
    case "lookup_documents": {
      const query = String(args.query ?? "");
      logger.log(
        `${tag} 📚 [RAG ノード] lookup_documents query="${clip(query, 120)}" ` +
          `minScore=${context.documentMinScore}`
      );
      return;
    }
    case "lookup_faq": {
      const query = String(args.query ?? "");
      logger.log(
        `${tag} ❓ [FAQ ノード] lookup_faq query="${clip(query, 120)}" ` +
          `minScore>${context.faqMinScore}`
      );
      return;
    }
    case "submit_collected_info": {
      const fields = args.fields as Record<string, unknown> | undefined;
      const keys = fields ? Object.keys(fields) : [];
      logger.log(`${tag} 📝 [情報収集ノード] submit_collected_info fields={${keys.join(", ")}}`);
      return;
    }
    case "transfer_call": {
      const to = String(args.to ?? context.transferTo ?? "(既定値なし)");
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(`${tag} 📞 [転送ノード] transfer_call to=${to} reason=${clip(reason, 80)}`);
      return;
    }
    case "send_notification": {
      const target = String(args.target ?? context.notifyTarget ?? "(既定値なし)");
      const subject = args.subject ? String(args.subject) : "(件名なし)";
      const bodyLen = String(args.body ?? "").length;
      logger.log(
        `${tag} 📨 [通知ノード] send_notification target=${target} ` +
          `subject="${clip(subject, 80)}" bodyLen=${bodyLen}`
      );
      return;
    }
    case "end_call": {
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(`${tag} 🏁 [終了ノード] end_call reason=${clip(reason, 80)}`);
      return;
    }
    default:
      logger.log(`${tag} 🛠 [未知ツール] ${toolName} args=${summarizeForLog(args)}`);
  }
}

export function logToolNodeResult(
  logger: Logger,
  tag: string,
  toolName: string,
  output: unknown,
  elapsedMs: number,
  context: RealtimeToolLogContext
) {
  const out = (output ?? {}) as Record<string, unknown>;
  const ok = out.ok !== false;
  const okMark = ok ? "✓" : "✗";

  switch (toolName) {
    case "lookup_documents":
    case "lookup_faq": {
      const sources = Array.isArray(out.sources)
        ? (out.sources as Array<{ title?: string; score?: number }>)
        : [];
      const top = sources[0];
      const sourcesSummary =
        sources.length === 0
          ? "(該当なし)"
          : sources
              .slice(0, 3)
              .map((s) => `${s.title ?? "?"}(${typeof s.score === "number" ? s.score.toFixed(3) : "?"})`)
              .join(", ") + (sources.length > 3 ? `, +${sources.length - 3}件` : "");
      const answer = typeof out.answer === "string" ? out.answer : "";
      const icon = toolName === "lookup_documents" ? "📚" : "❓";
      const label = toolName === "lookup_documents" ? "RAG" : "FAQ";
      if (sources.length === 0) {
        const minScore =
          toolName === "lookup_documents" ? context.documentMinScore : context.faqMinScore;
        logger.warn(
          `${tag} ${icon} [${label} ノード結果] ${okMark} hits=0 (${elapsedMs}ms) ` +
            `→ minScore=${minScore} で全件フィルタされている可能性`
        );
      } else {
        logger.log(
          `${tag} ${icon} [${label} ノード結果] ${okMark} hits=${sources.length} ` +
            `topScore=${top?.score?.toFixed(3) ?? "?"} (${elapsedMs}ms)`
        );
        logger.log(`${tag}    sources=${sourcesSummary}`);
        if (answer) logger.log(`${tag}    answer="${clip(answer, 200)}"`);
      }
      return;
    }
    case "submit_collected_info": {
      const fields = out.fields as Record<string, unknown> | undefined;
      const entries = fields ? Object.entries(fields) : [];
      const summary = entries.map(([k, v]) => `${k}=${clip(String(v), 40)}`).join(", ");
      const missing = Array.isArray(out.missingFields)
        ? (out.missingFields as unknown[]).map(String)
        : [];
      logger.log(
        `${tag} 📝 [情報収集ノード結果] ${okMark} (${elapsedMs}ms) ${summary || "(空)"}` +
          (missing.length > 0 ? ` missing={${missing.join(", ")}}` : "")
      );
      return;
    }
    case "transfer_call":
      logger.log(
        `${tag} 📞 [転送ノード結果] ${okMark} (${elapsedMs}ms) to=${String(out.to ?? "-")}` +
          (out.error ? ` error=${String(out.error)}` : "")
      );
      return;
    case "send_notification":
      logger.log(`${tag} 📨 [通知ノード結果] ${okMark} (${elapsedMs}ms) target=${String(out.target ?? "-")}`);
      return;
    case "end_call":
      logger.log(`${tag} 🏁 [終了ノード結果] ${okMark} (${elapsedMs}ms)`);
      return;
    default:
      logger.log(`${tag} 🛠 [未知ツール結果] ${toolName} ${okMark} (${elapsedMs}ms) ${summarizeForLog(output)}`);
  }
}

function clip(text: string, max: number) {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
