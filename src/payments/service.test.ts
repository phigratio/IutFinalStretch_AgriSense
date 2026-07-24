/**
 * Checkout flow tests (P-1): happy path, insufficient balance, hard debit
 * failure, SMS-failure-is-nonfatal, and trace logging. All offline: mock
 * bdapps client + in-memory stores.
 */
import { describe, it, expect } from "vitest";
import { checkout, type CheckoutDeps } from "./service.js";
import { InMemoryPaymentStore } from "./store.js";
import { MockBdappsClient } from "../bdapps/mock.js";
import { InMemoryAgriSenseStore } from "../agrisense/agrisenseStore.js";
import type { BdappsApi } from "../bdapps/index.js";

const SESSION = "11111111-1111-4111-8111-111111111111";

function makeDeps(bdapps: BdappsApi = new MockBdappsClient()): CheckoutDeps & {
  payments: InMemoryPaymentStore;
  trace: InMemoryAgriSenseStore;
} {
  return { bdapps, payments: new InMemoryPaymentStore(), trace: new InMemoryAgriSenseStore() };
}

describe("checkout happy path", () => {
  it("charges, persists success with receipt, sends SMS, logs 4 trace steps", async () => {
    const deps = makeDeps();
    const res = await checkout(
      { mobile: "01812345678", amountBdt: 45, description: "50kg urea", sessionId: SESSION },
      deps,
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe("success");
    expect(res.statusCode).toBe("S1000");
    expect(res.balanceBeforeBdt).toBe(100);
    expect(res.internalTrxId).toBeTruthy();
    expect(res.externalTrxId).toMatch(/^AGS-/);
    expect(res.smsSent).toBe(true);
    expect(res.mock).toBe(true);

    const stored = await deps.payments.getPayment(res.paymentId);
    expect(stored?.status).toBe("success");
    expect(stored?.receiptNumber).toBe(res.internalTrxId);
    expect(stored?.externalReference).toBe(res.externalTrxId);

    const trace = await deps.trace.listTrace(SESSION);
    expect(trace.map((e) => (e as { toolName: string }).toolName)).toEqual([
      "bdapps_list_payment_instruments",
      "bdapps_query_balance",
      "bdapps_direct_debit",
      "bdapps_send_sms",
    ]);
  });

  it("skips trace logging when no sessionId is given", async () => {
    const deps = makeDeps();
    const res = await checkout({ mobile: "01812345678", amountBdt: 10 }, deps);
    expect(res.ok).toBe(true);
    expect(deps.trace.traces.size).toBe(0);
  });
});

describe("checkout failure paths", () => {
  it("stops at balance check when funds are short (E1326, no debit attempted)", async () => {
    const deps = makeDeps();
    const res = await checkout(
      { mobile: "01812345678", amountBdt: 5000, sessionId: SESSION },
      deps,
    );

    expect(res.ok).toBe(false);
    expect(res.status).toBe("insufficient");
    expect(res.statusCode).toBe("E1326");
    expect(res.balanceBeforeBdt).toBe(100);
    expect((await deps.payments.getPayment(res.paymentId))?.status).toBe("insufficient");

    const tools = (await deps.trace.listTrace(SESSION)).map(
      (e) => (e as { toolName: string }).toolName,
    );
    expect(tools).not.toContain("bdapps_direct_debit");
  });

  it("marks payment failed when the debit itself errors", async () => {
    const failing = new MockBdappsClient();
    failing.directDebit = async () => ({ statusCode: "E1601", statusDetail: "System error", mock: true });
    const deps = makeDeps(failing);

    const res = await checkout({ mobile: "01812345678", amountBdt: 10 }, deps);
    expect(res.ok).toBe(false);
    expect(res.status).toBe("failed");
    expect((await deps.payments.getPayment(res.paymentId))?.status).toBe("failed");
  });

  it("keeps the charge successful even when the receipt SMS throws", async () => {
    const flaky = new MockBdappsClient();
    flaky.sendSms = async () => {
      throw new Error("SMS gateway down");
    };
    const deps = makeDeps(flaky);

    const res = await checkout({ mobile: "01812345678", amountBdt: 10 }, deps);
    expect(res.ok).toBe(true);
    expect(res.status).toBe("success");
    expect(res.smsSent).toBe(false);
  });

  it("survives a broken trace store without failing the payment", async () => {
    const deps = makeDeps();
    deps.trace.saveTrace = async () => {
      throw new Error("db down");
    };
    const res = await checkout(
      { mobile: "01812345678", amountBdt: 10, sessionId: SESSION },
      deps,
    );
    expect(res.ok).toBe(true);
  });
});
