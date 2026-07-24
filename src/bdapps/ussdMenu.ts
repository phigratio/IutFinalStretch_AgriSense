/**
 * AgriSense USSD menu (P5, BDAPPS-INTEGRATION-PLAN Flow E) — offline access on
 * any phone, no app or internet. Farmer dials the code (`*213*74757#`); BDApps
 * runs a session: mo-init shows the menu, mo-cont carries their choice. We
 * answer from the same reads as inbound SMS, keyed by the masked sourceAddress.
 * Option 3 opts them into the SMS channel (captures the masked address).
 * Consumed by routes/bdappsListeners.ts.
 */
import type { IncomingUssd } from "./types.js";
import { type ChannelStore, getDefaultChannelStore } from "./channel.js";
import type { InboundData } from "./inboundSms.js";

export interface UssdReply {
  message: string;
  /** mt-cont keeps the session open for another reply; mt-fin ends it. */
  operation: "mt-cont" | "mt-fin";
}

export interface UssdDeps {
  channel: ChannelStore;
  data?: InboundData;
}

const MENU = "AgriSense\n1. My season plan\n2. Weather\n3. Get SMS alerts\n4. Help";

/** Trim a reply to a safe USSD length (gateways cap ~160 chars). */
function ussd(message: string): string {
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
}

export async function handleUssdMenu(
  incoming: IncomingUssd,
  deps: UssdDeps = { channel: getDefaultChannelStore() },
): Promise<UssdReply> {
  if (incoming.ussdOperation === "mo-init") {
    return { message: MENU, operation: "mt-cont" };
  }

  const choice = (incoming.message ?? "").trim();
  const subscriberId = incoming.sourceAddress;

  switch (choice) {
    case "1": {
      const summary = await deps.data?.planSummary(subscriberId);
      return { message: ussd(summary ?? "No season plan yet. Open the AgriSense app to create one."), operation: "mt-fin" };
    }
    case "2": {
      const summary = await deps.data?.weatherSummary(subscriberId);
      return { message: ussd(summary ?? "No farm location on file. Set up your farm in the app."), operation: "mt-fin" };
    }
    case "3": {
      await deps.channel.activate({ maskedSubscriberId: subscriberId, source: "inbound_ussd" });
      return { message: "Done! You will now get weather and pest alerts by SMS.", operation: "mt-fin" };
    }
    case "4":
      return { message: "Dial *213*74757# anytime for your plan, weather, and to enable alerts.", operation: "mt-fin" };
    default:
      return { message: `Invalid option "${choice}". Dial again and choose 1-4.`, operation: "mt-fin" };
  }
}
