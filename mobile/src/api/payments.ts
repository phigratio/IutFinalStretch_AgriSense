/**
 * bdapps CaaS checkout API — wraps the backend's payments routes:
 *   POST /api/payments/checkout   (list PI -> balance -> debit -> receipt SMS)
 *   GET  /api/payments/:id        (receipt readback)
 * Domain outcomes (insufficient/failed) come back as ok:false, HTTP 200 —
 * the Money screen renders them as flows, not errors.
 * Consumed by: money/checkout screen, receipt screen.
 */
import { apiFetch } from "./client";
import type { CheckoutResult, PaymentRecord } from "./types";

export interface CheckoutRequest {
  mobile: string;
  amountBdt: number;
  description?: string;
  planId?: string;
  sessionId?: string;
}

export function checkout(input: CheckoutRequest): Promise<CheckoutResult> {
  return apiFetch<CheckoutResult>("/api/payments/checkout", { method: "POST", body: input });
}

export function getPayment(paymentId: string): Promise<PaymentRecord> {
  return apiFetch<PaymentRecord>(`/api/payments/${encodeURIComponent(paymentId)}`);
}
