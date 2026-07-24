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

bdappsTestRouter.post("/sms", handle((req) => bdapps.sendSms(req.body.to, req.body.message)));
bdappsTestRouter.post("/broadcast", handle((req) => bdapps.broadcastSms(req.body.message)));

bdappsTestRouter.post("/otp/request", handle((req) => bdapps.requestOtp(req.body.mobile)));
bdappsTestRouter.post("/otp/verify", handle((req) => bdapps.verifyOtp(req.body.referenceNo, req.body.otp)));

bdappsTestRouter.post("/balance", handle((req) => bdapps.queryBalance(req.body.mobile)));
bdappsTestRouter.post("/pi", handle((req) => bdapps.listPaymentInstruments(req.body.mobile)));
bdappsTestRouter.post("/charge", handle((req) => bdapps.directDebit({ mobile: req.body.mobile, amount: req.body.amount })));

bdappsTestRouter.post("/subscription/status", handle((req) => bdapps.getSubscriptionStatus(req.body.mobile)));
bdappsTestRouter.post("/subscription/subscribe", handle((req) => bdapps.subscribe(req.body.mobile)));
bdappsTestRouter.post("/subscription/unsubscribe", handle((req) => bdapps.unsubscribe(req.body.mobile)));
