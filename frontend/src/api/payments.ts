import { apiFetch } from "./client.js";

export interface CheckoutResult {
  ok: boolean;
  paymentId: string;
  status: "success" | "insufficient" | "failed";
  statusCode: string;
  statusDetail?: string;
  externalTrxId?: string;
  internalTrxId?: string;
  balanceBeforeBdt?: number;
  amountBdt: number;
  smsSent: boolean;
  mock: boolean;
}

export interface PaymentRecord {
  id: string;
  mobile: string;
  amountBdt: number;
  status: "pending" | "success" | "insufficient" | "failed";
  planId?: string;
  userId?: string;
  externalReference?: string;
  receiptNumber?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
  createdAt: string;
}

export function checkoutPayment(input: {
  mobile: string;
  amountBdt: number;
  description?: string;
  planId?: string;
  sessionId?: string;
  userId?: string;
}): Promise<CheckoutResult> {
  return apiFetch<CheckoutResult>("/api/payments/checkout", {
    method: "POST",
    body: input,
  });
}

export function getPayment(id: string): Promise<PaymentRecord> {
  return apiFetch<PaymentRecord>(`/api/payments/${id}`);
}
