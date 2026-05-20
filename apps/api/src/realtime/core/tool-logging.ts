import { Logger } from "@nestjs/common";

export interface RealtimeToolLogContext {
  ragPrecision: number;
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
          `minScore=${context.ragPrecision}`
      );
      return;
    }
    case "lookup_faq": {
      const query = String(args.query ?? "");
      logger.log(`${tag} ❓ [FAQ ノード] lookup_faq query="${clip(query, 120)}"`);
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
        logger.warn(
          `${tag} ${icon} [${label} ノード結果] ${okMark} hits=0 (${elapsedMs}ms) ` +
            `→ minScore=${context.ragPrecision} で全件フィルタされている可能性`
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
