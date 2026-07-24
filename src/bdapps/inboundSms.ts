/**
 * Inbound SMS keyword router (P4, BDAPPS-INTEGRATION-PLAN Flow D) — lets a
 * no-app farmer use AgriSense over plain SMS. They text the shortcode+keyword
 * (e.g. "agrilive PLAN") and BDApps delivers the message here; we reply by SMS.
 *
 * Inbound also doubles as a channel opt-in: START captures the farmer's masked
 * sourceAddress (a reach credential we can obtain without OTP — see channel.ts
 * capture points). Consumed by routes/bdappsListeners.ts.
 */
import type { IncomingSms } from "./types.js";
import { type ChannelStore, getDefaultChannelStore } from "./channel.js";

export interface InboundData {
  /** One-line plan status for the farmer, or undefined if none on file. */
  planSummary(subscriberId: string): Promise<string | undefined>;
  /** One-line weather line for the farmer's farm, or undefined. */
  weatherSummary(subscriberId: string): Promise<string | undefined>;
}

export interface InboundSmsDeps {
  channel: ChannelStore;
  data?: InboundData;
}

export interface ParsedCommand {
  cmd: "START" | "STOP" | "PLAN" | "WEATHER" | "HELP" | "UNKNOWN";
  arg?: string;
}

const HELP_TEXT =
  "AgriSense SMS: reply START to get alerts, PLAN for your season status, WEATHER for the forecast, STOP to opt out.";

/** First word → command; rest → arg. Case-insensitive, tolerant of the keyword. */
export function parseCommand(message: string): ParsedCommand {
  const words = (message ?? "").trim().split(/\s+/).filter(Boolean);
  const first = (words[0] ?? "").toUpperCase();
  const arg = words.slice(1).join(" ") || undefined;
  switch (first) {
    case "START":
    case "JOIN":
    case "SUBSCRIBE":
      return { cmd: "START" };
    case "STOP":
    case "UNSUB":
    case "UNSUBSCRIBE":
      return { cmd: "STOP" };
    case "PLAN":
    case "STATUS":
      return { cmd: "PLAN" };
    case "WEATHER":
    case "ABHAOA": // banglish
      return { cmd: "WEATHER" };
    case "HELP":
    case "":
      return { cmd: "HELP" };
    default:
      return { cmd: "UNKNOWN", arg };
  }
}

/**
 * Handle one inbound SMS: run the command against the farmer identified by the
 * (masked) sourceAddress and return the reply text to send back. Pure of the
 * SMS transport — the caller sends the reply — so it is unit-testable.
 */
export async function handleInboundSms(
  incoming: IncomingSms,
  deps: InboundSmsDeps = { channel: getDefaultChannelStore() },
): Promise<{ reply: string; command: ParsedCommand["cmd"] }> {
  const subscriberId = incoming.sourceAddress;
  const { cmd } = parseCommand(incoming.message ?? "");

  switch (cmd) {
    case "START": {
      // Inbound opt-in: capture the masked id so we can reach them going forward.
      await deps.channel.activate({
        maskedSubscriberId: subscriberId,
        source: "inbound_sms",
      });
      return {
        reply: "Welcome to AgriSense! You will now get weather and pest alerts by SMS. Reply HELP for options.",
        command: cmd,
      };
    }
    case "STOP":
      return { reply: "You have opted out of AgriSense SMS alerts. Reply START to rejoin.", command: cmd };
    case "PLAN": {
      const summary = await deps.data?.planSummary(subscriberId);
      return {
        reply: summary ?? "No season plan on file yet. Open the AgriSense app to create one.",
        command: cmd,
      };
    }
    case "WEATHER": {
      const summary = await deps.data?.weatherSummary(subscriberId);
      return {
        reply: summary ?? "No farm location on file yet. Open the AgriSense app to set up your farm.",
        command: cmd,
      };
    }
    case "HELP":
    default:
      return { reply: HELP_TEXT, command: "HELP" };
  }
}
