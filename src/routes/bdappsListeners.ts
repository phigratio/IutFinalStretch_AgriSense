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
import { activateChannel } from "../bdapps/channel.js";

export const bdappsListenerRouter = Router();

const ack = { statusCode: "S1000", statusDetail: "Success" };

/** A `tel:` value that is a plain BD number (not a masked token). */
function looksLikeRawNumber(subscriberId: string): boolean {
  return /^tel:880\d{10}$/.test(subscriberId.replace(/\s+/g, ""));
}

/** A user texted your short code + keyword. */
bdappsListenerRouter.post("/sms", async (req, res) => {
  const incoming = req.body as IncomingSms;
  console.log("[SMS IN]", JSON.stringify(incoming));

  const text = (incoming.message ?? "").trim().toUpperCase();
  try {
    if (text === "STOP" || text === "UNSUB") {
      await bdapps.unsubscribe(incoming.sourceAddress);
      await bdapps.sendSms(incoming.sourceAddress, "You have been unsubscribed. Bye!");
    } else {
      // Simple echo bot — replace with your logic.
      await bdapps.sendSms(incoming.sourceAddress, `You said: ${incoming.message}`);
    }
  } catch (err) {
    console.error("[SMS] auto-reply failed:", err);
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
