import { Logger } from "@nestjs/common";

// ─────────────────────────────────────────────────────────────
// 新 tool 群 (get_flow_state / move_to_node / update_collected_info /
// search_faq / search_documents / send_notification / request_transfer /
// request_end_call) のログ整形。
//
// 文脈の閾値等は snapshot に含まれるので、ロガーは引数だけ見れば十分。
// ─────────────────────────────────────────────────────────────

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
  args: Record<string, unknown>
) {
  switch (toolName) {
    case "get_flow_state":
      logger.log(`${tag} 🧭 [脳→Backend] get_flow_state`);
      return;
    case "update_collected_info": {
      const slots = (args.slots as Record<string, unknown>) ?? {};
      const keys = Object.keys(slots);
      logger.log(
        `${tag} 📝 [脳→Backend] update_collected_info slots={${keys.join(", ")}}`
      );
      return;
    }
    case "move_to_node": {
      const target = String(args.target_node_id ?? args.targetNodeId ?? "");
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(
        `${tag} ➡ [脳→Backend] move_to_node target=${target} reason=${clip(reason, 80)}`
      );
      return;
    }
    case "search_faq": {
      const query = String(args.query ?? "");
      logger.log(`${tag} ❓ [脳→Backend] search_faq query="${clip(query, 120)}"`);
      return;
    }
    case "search_documents": {
      const query = String(args.query ?? "");
      logger.log(`${tag} 📚 [脳→Backend] search_documents query="${clip(query, 120)}"`);
      return;
    }
    case "send_notification": {
      const target = args.target ? String(args.target) : "(既定値)";
      const subject = args.subject ? String(args.subject) : "(件名なし)";
      const bodyLen = String(args.body ?? "").length;
      logger.log(
        `${tag} 📨 [脳→Backend] send_notification target=${target} ` +
          `subject="${clip(subject, 80)}" bodyLen=${bodyLen}`
      );
      return;
    }
    case "request_transfer": {
      const to = args.to ? String(args.to) : "(既定値)";
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(
        `${tag} 📞 [脳→Backend] request_transfer to=${to} reason=${clip(reason, 80)}`
      );
      return;
    }
    case "request_end_call": {
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(`${tag} 🏁 [脳→Backend] request_end_call reason=${clip(reason, 80)}`);
      return;
    }
    default:
      logger.log(`${tag} 🛠 [脳→Backend 未知ツール] ${toolName} args=${summarizeForLog(args)}`);
  }
}

export function logToolNodeResult(
  logger: Logger,
  tag: string,
  toolName: string,
  output: unknown,
  elapsedMs: number
) {
  const out = (output ?? {}) as Record<string, unknown>;
  const ok = out.ok !== false;
  const okMark = ok ? "✓" : "✗";
  const snapshot = out.snapshot as
    | { currentNode?: { id?: string; type?: string; actionType?: string } }
    | undefined;
  const currentNodeSummary = snapshot?.currentNode
    ? ` current=${snapshot.currentNode.id}(${snapshot.currentNode.type}${
        snapshot.currentNode.actionType ? `/${snapshot.currentNode.actionType}` : ""
      })`
    : "";

  switch (toolName) {
    case "get_flow_state":
      logger.log(
        `${tag} 🧭 [Backend→脳] get_flow_state ${okMark} (${elapsedMs}ms)${currentNodeSummary}`
      );
      return;
    case "update_collected_info": {
      const accepted = out.acceptedSlots as Record<string, unknown> | undefined;
      const missing = Array.isArray(out.missingSlots)
        ? (out.missingSlots as unknown[]).map(String)
        : [];
      const entries = accepted ? Object.entries(accepted) : [];
      const summary = entries.map(([k, v]) => `${k}=${clip(String(v), 40)}`).join(", ");
      logger.log(
        `${tag} 📝 [Backend→脳] update_collected_info ${okMark} (${elapsedMs}ms) ${summary || "(空)"}` +
          (missing.length > 0 ? ` missing={${missing.join(", ")}}` : "") +
          currentNodeSummary
      );
      return;
    }
    case "move_to_node": {
      const message = out.message ? ` message="${clip(String(out.message), 120)}"` : "";
      logger.log(
        `${tag} ➡ [Backend→脳] move_to_node ${okMark} (${elapsedMs}ms)${currentNodeSummary}${message}`
      );
      return;
    }
    case "search_faq":
    case "search_documents": {
      const sources = Array.isArray(out.sources)
        ? (out.sources as Array<{ title?: string; score?: number }>)
        : [];
      const top = sources[0];
      const answer = typeof out.answer === "string" ? out.answer : "";
      const icon = toolName === "search_documents" ? "📚" : "❓";
      if (sources.length === 0) {
        logger.warn(
          `${tag} ${icon} [Backend→脳] ${toolName} ${okMark} hits=0 (${elapsedMs}ms)`
        );
      } else {
        const sourcesSummary =
          sources
            .slice(0, 3)
            .map(
              (s) =>
                `${s.title ?? "?"}(${typeof s.score === "number" ? s.score.toFixed(3) : "?"})`
            )
            .join(", ") + (sources.length > 3 ? `, +${sources.length - 3}件` : "");
        logger.log(
          `${tag} ${icon} [Backend→脳] ${toolName} ${okMark} hits=${sources.length} ` +
            `topScore=${top?.score?.toFixed(3) ?? "?"} (${elapsedMs}ms)`
        );
        logger.log(`${tag}    sources=${sourcesSummary}`);
        if (answer) logger.log(`${tag}    answer="${clip(answer, 200)}"`);
      }
      return;
    }
    case "send_notification":
      logger.log(
        `${tag} 📨 [Backend→脳] send_notification ${okMark} (${elapsedMs}ms) target=${String(out.target ?? "-")}`
      );
      return;
    case "request_transfer":
      logger.log(
        `${tag} 📞 [Backend→脳] request_transfer ${okMark} (${elapsedMs}ms) to=${String(out.to ?? "-")}` +
          (out.error ? ` error=${String(out.error)}` : "")
      );
      return;
    case "request_end_call":
      logger.log(
        `${tag} 🏁 [Backend→脳] request_end_call ${okMark} (${elapsedMs}ms)`
      );
      return;
    default:
      logger.log(
        `${tag} 🛠 [Backend→脳 未知ツール] ${toolName} ${okMark} (${elapsedMs}ms) ${summarizeForLog(output)}`
      );
  }
}

function clip(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
