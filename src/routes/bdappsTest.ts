/**
 * OUTGOING test triggers — call these from Postman/curl/browser to fire the
 * BDApps APIs and see the raw response. Handy for testing without the CLI.
 *
 * Registered in app.ts under "/api/bdapps", so the URLs are e.g.:
 *   POST /api/bdapps/sms                     { "to": "018...", "message": "hi" }
 *   POST /api/bdapps/otp/request             { "mobile": "018..." }
 *   POST /api/bdapps/otp/verify              { "referenceNo": "...", "otp": "1234" }
 *   POST /api/bdapps/balance                 { "mobile": "018..." }
 *   POST /api/bdapps/pi                       { "mobile": "018..." }
 *   POST /api/bdapps/charge                   { "mobile": "018...", "amount": 2 }
 *   POST /api/bdapps/subscription/status      { "mobile": "018..." }
 *   POST /api/bdapps/subscription/subscribe   { "mobile": "018..." }
 *   POST /api/bdapps/subscription/unsubscribe { "mobile": "018..." }
 *
 * NOTE: These expose your BDApps calls with no auth — fine for a hackathon,
 * but remove or protect them before any real deployment.
 */
import { Router, type Request, type Response } from "express";
import { bdapps } from "../bdapps/index.js";
import {
  rememberOtpReference,
  rememberMaskedSubscriber,
  resolveSubscriberAddress,
} from "../bdapps/subscriberStore.js";

export const bdappsTestRouter = Router();

/** Run a client call and return its result (or a readable error) as JSON. */
function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await fn(req));
    } catch (err) {
      res.status(400).json({
        error: (err as Error).message,
        code: (err as { statusCode?: string }).statusCode,
      });
    }
  };
}

// Subscriber-bearing calls resolve to the masked id when we've captured one
// (bdapps rejects the raw number with E1951 on this app — see subscriberStore).
bdappsTestRouter.post("/sms", handle((req) => bdapps.sendSms(resolveSubscriberAddress(req.body.to), req.body.message)));
bdappsTestRouter.post("/broadcast", handle((req) => bdapps.broadcastSms(req.body.message)));

// OTP request remembers referenceNo -> number; verify captures the masked id.
bdappsTestRouter.post("/otp/request", handle(async (req) => {
  const result = await bdapps.requestOtp(req.body.mobile);
  const referenceNo = (result as { referenceNo?: string }).referenceNo;
  if (referenceNo) rememberOtpReference(referenceNo, req.body.mobile);
  return result;
}));
bdappsTestRouter.post("/otp/verify", handle(async (req) => {
  const result = await bdapps.verifyOtp(req.body.referenceNo, req.body.otp);
  const masked = (result as { subscriberId?: string }).subscriberId;
  if (masked) rememberMaskedSubscriber(req.body.referenceNo, masked);
  return result;
}));

bdappsTestRouter.post("/balance", handle((req) => bdapps.queryBalance(resolveSubscriberAddress(req.body.mobile))));
bdappsTestRouter.post("/pi", handle((req) => bdapps.listPaymentInstruments(resolveSubscriberAddress(req.body.mobile))));
bdappsTestRouter.post("/charge", handle((req) => bdapps.directDebit({ mobile: resolveSubscriberAddress(req.body.mobile), amount: req.body.amount })));

bdappsTestRouter.post("/subscription/status", handle((req) => bdapps.getSubscriptionStatus(resolveSubscriberAddress(req.body.mobile))));
bdappsTestRouter.post("/subscription/subscribe", handle((req) => bdapps.subscribe(resolveSubscriberAddress(req.body.mobile))));
bdappsTestRouter.post("/subscription/unsubscribe", handle((req) => bdapps.unsubscribe(resolveSubscriberAddress(req.body.mobile))));
