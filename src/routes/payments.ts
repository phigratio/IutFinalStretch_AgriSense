/**
 * Payment API for the mobile app's checkout flow (P-1).
 *   POST /api/payments/checkout  { mobile, amountBdt, description?, planId?, sessionId?, userId? }
 *   GET  /api/payments/:id       receipt readback for the receipt screen
 * Thin HTTP shell over payments/service.ts — the agent's checkout tool calls
 * the same service, so app-driven and agent-driven payments are one code path.
 */
import { Router, type Request, type Response } from "express";
import { checkout, type CheckoutDeps } from "../payments/service.js";
import { getDefaultPaymentStore, type PaymentStore } from "../payments/store.js";

export function createPaymentsRouter(deps?: CheckoutDeps): Router {
  const router = Router();
  const store = (): PaymentStore => deps?.payments ?? getDefaultPaymentStore();

  router.post("/checkout", async (req: Request, res: Response): Promise<void> => {
    const { mobile, amountBdt, description, planId, sessionId, userId } = req.body ?? {};
    if (typeof mobile !== "string" || mobile.trim() === "") {
      res.status(400).json({ error: "mobile is required" });
      return;
    }
    const amount = Number(amountBdt);
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ error: "amountBdt must be a positive number" });
      return;
    }
    try {
      // Domain outcomes (insufficient/failed) are 200s with ok:false — the app
      // renders them as flows, not errors. 400/500 = the request itself broke.
      res.json(
        await checkout(
          { mobile, amountBdt: amount, description, planId, sessionId, userId },
          deps,
        ),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const payment = await store().getPayment(String(req.params.id));
      if (!payment) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }
      res.json(payment);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const paymentsRouter = createPaymentsRouter();
