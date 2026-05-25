import { Logger } from "@nestjs/common";

// ─────────────────────────────────────────────────────────────
// 新 tool 群 (get_flow_state / move_to_node / update_collected_info /
// search_faq / search_documents / send_notification / request_transfer /
// request_end_call) のログ整形。
//
// 文脈の閾値等は snapshot に含まれるので、ロガーは引数だけ見れば十分。
// ─────────────────────────────────────────────────────────────

const LOG_RESET = "\x1b[0m";
const LOG_DIM = "\x1b[2m";
const LOG_YELLOW = "\x1b[33m";

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
      logger.log(`${LOG_YELLOW}${tag} TOOL → get_flow_state${LOG_RESET}`);
      return;
    case "update_collected_info": {
      const slots = (args.slots as Record<string, unknown>) ?? {};
      const keys = Object.keys(slots);
      logger.log(
        `${LOG_YELLOW}${tag} TOOL → update_collected_info slots={${keys.join(", ")}}${LOG_RESET}`
      );
      return;
    }
    case "move_to_node": {
      const target = String(args.target_node_id ?? args.targetNodeId ?? "");
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(
        `${LOG_YELLOW}${tag} TOOL → move_to_node target=${target} reason=${clip(reason, 80)}${LOG_RESET}`
      );
      return;
    }
    case "search_faq": {
      const query = String(args.query ?? "");
      logger.log(`${LOG_YELLOW}${tag} TOOL → search_faq query="${clip(query, 120)}"${LOG_RESET}`);
      return;
    }
    case "search_documents": {
      const query = String(args.query ?? "");
      logger.log(`${LOG_YELLOW}${tag} TOOL → search_documents query="${clip(query, 120)}"${LOG_RESET}`);
      return;
    }
    case "send_notification": {
      const target = args.target ? String(args.target) : "(既定値)";
      const subject = args.subject ? String(args.subject) : "(件名なし)";
      const bodyLen = String(args.body ?? "").length;
      logger.log(
        `${LOG_YELLOW}${tag} TOOL → send_notification target=${target} ` +
          `subject="${clip(subject, 80)}" bodyLen=${bodyLen}${LOG_RESET}`
      );
      return;
    }
    case "request_transfer": {
      const to = args.to ? String(args.to) : "(既定値)";
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(
        `${LOG_YELLOW}${tag} TOOL → request_transfer to=${to} reason=${clip(reason, 80)}${LOG_RESET}`
      );
      return;
    }
    case "request_end_call": {
      const reason = args.reason ? String(args.reason) : "-";
      logger.log(`${LOG_YELLOW}${tag} TOOL → request_end_call reason=${clip(reason, 80)}${LOG_RESET}`);
      return;
    }
    default:
      logger.log(`${LOG_YELLOW}${tag} TOOL → ${toolName} args=${summarizeForLog(args)}${LOG_RESET}`);
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
        `${LOG_YELLOW}${tag} TOOL ← get_flow_state ${okMark} (${elapsedMs}ms)${currentNodeSummary}${LOG_RESET}`
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
        `${LOG_YELLOW}${tag} TOOL ← update_collected_info ${okMark} (${elapsedMs}ms) ${summary || "(空)"}` +
          (missing.length > 0 ? ` missing={${missing.join(", ")}}` : "") +
          `${currentNodeSummary}${LOG_RESET}`
      );
      return;
    }
    case "move_to_node": {
      const message = out.message ? ` message="${clip(String(out.message), 120)}"` : "";
      logger.log(
        `${LOG_YELLOW}${tag} TOOL ← move_to_node ${okMark} (${elapsedMs}ms)${currentNodeSummary}${message}${LOG_RESET}`
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
      if (sources.length === 0) {
        logger.warn(
          `${LOG_YELLOW}${tag} TOOL ← ${toolName} ${okMark} hits=0 (${elapsedMs}ms)${LOG_RESET}`
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
          `${LOG_YELLOW}${tag} TOOL ← ${toolName} ${okMark} hits=${sources.length} ` +
            `topScore=${top?.score?.toFixed(3) ?? "?"} (${elapsedMs}ms)${LOG_RESET}`
        );
        logger.debug(`${LOG_DIM}${tag} sources=${sourcesSummary}${LOG_RESET}`);
        if (answer) logger.debug(`${LOG_DIM}${tag} answer="${clip(answer, 200)}"${LOG_RESET}`);
      }
      return;
    }
    case "send_notification":
      logger.log(
        `${LOG_YELLOW}${tag} TOOL ← send_notification ${okMark} (${elapsedMs}ms) target=${String(out.target ?? "-")}${LOG_RESET}`
      );
      return;
    case "request_transfer":
      logger.log(
        `${LOG_YELLOW}${tag} TOOL ← request_transfer ${okMark} (${elapsedMs}ms) to=${String(out.to ?? "-")}` +
          `${out.error ? ` error=${String(out.error)}` : ""}${LOG_RESET}`
      );
      return;
    case "request_end_call":
      logger.log(
        `${LOG_YELLOW}${tag} TOOL ← request_end_call ${okMark} (${elapsedMs}ms)${LOG_RESET}`
      );
      return;
    default:
      logger.log(
        `${LOG_YELLOW}${tag} TOOL ← ${toolName} ${okMark} (${elapsedMs}ms) ${summarizeForLog(output)}${LOG_RESET}`
      );
  }
}

function clip(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}
