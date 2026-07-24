/**
 * INCOMING webhooks — these are the URLs you register in BDApps provisioning.
 * BDApps calls THESE when a user texts you, dials your USSD, or a subscription
 * changes. Every handler must reply { statusCode: "S1000" } to acknowledge.
 *
 * Registered in app.ts under "/bdapps", so the URLs are:
 *   POST /bdapps/sms           (Message Receiving URL)
 *   POST /bdapps/ussd          (USSD Connection URL)
 *   POST /bdapps/subscription  (Subscription Notification URL)
 */
import { Router } from "express";
import { bdapps, handleUssd } from "../bdapps/index.js";
import type {
  IncomingSms,
  IncomingUssd,
  IncomingSubscriptionNotification,
} from "../bdapps/index.js";
import { activateChannel, getDefaultChannelStore } from "../bdapps/channel.js";
import { handleInboundSms } from "../bdapps/inboundSms.js";
import { getDefaultInboundData } from "../bdapps/inboundData.js";

export const bdappsListenerRouter = Router();

const ack = { statusCode: "S1000", statusDetail: "Success" };

/** A `tel:` value that is a plain BD number (not a masked token). */
function looksLikeRawNumber(subscriberId: string): boolean {
  return /^tel:880\d{10}$/.test(subscriberId.replace(/\s+/g, ""));
}

/**
 * A farmer texted your shortcode+keyword. Route the keyword (START/STOP/PLAN/
 * WEATHER/HELP) and reply by SMS — lets no-app farmers use AgriSense (Flow D).
 * START also opts them into the SMS channel (captures their masked address).
 */
bdappsListenerRouter.post("/sms", async (req, res) => {
  const incoming = req.body as IncomingSms;
  console.log("[SMS IN]", JSON.stringify(incoming));

  try {
    const { reply } = await handleInboundSms(incoming, {
      channel: getDefaultChannelStore(),
      data: getDefaultInboundData(),
    });
    await bdapps.sendSms(incoming.sourceAddress, reply);
  } catch (err) {
    console.error("[SMS] inbound handling failed:", err);
  }

  res.json(ack); // acknowledge receipt regardless
});

/** A user dialled your USSD code or replied to a menu. */
bdappsListenerRouter.post("/ussd", async (req, res) => {
  const incoming = req.body as IncomingUssd;
  console.log("[USSD IN]", JSON.stringify(incoming));

  try {
    const reply = handleUssd(incoming);
    // Push the next screen back to the user (needs a live session + credentials).
    await bdapps.sendUssd({
      sessionId: incoming.sessionId,
      destinationAddress: incoming.sourceAddress,
      message: reply.message,
      operation: reply.operation,
    });
  } catch (err) {
    console.error("[USSD] failed to send reply:", err);
  }

  res.json(ack);
});

/**
 * BDApps confirms a subscribe/unsubscribe. This is the CANONICAL channel-
 * activation capture point (DGD §6.3.2): on confirmation, BDApps delivers the
 * masked subscriberId here. We persist it to FarmerProfile so we can reach the
 * farmer, and flip their premium entitlement from the subscription status.
 */
bdappsListenerRouter.post("/subscription", async (req, res) => {
  const note = req.body as IncomingSubscriptionNotification;
  console.log("[SUBSCRIPTION IN]", JSON.stringify(note));

  try {
    if (note.subscriberId) {
      const registered = String(note.status).toUpperCase() === "REGISTERED";
      await activateChannel({
        maskedSubscriberId: note.subscriberId,
        // If BDApps sent a raw number, use it as the mobile link too.
        mobile: looksLikeRawNumber(note.subscriberId) ? note.subscriberId : undefined,
        source: "subscription_webhook",
        premium: registered,
      });
    }
  } catch (err) {
    console.error("[SUBSCRIPTION] channel activation failed:", err);
  }

  res.json(ack); // always acknowledge so BDApps doesn't retry-storm
});
