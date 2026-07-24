/**
 * Tests for the offline BDApps mock (mock.ts) and the MOCK_BDAPPS selection
 * in index.ts. These guard the payment feature's dev path: the checkout flow
 * must behave identically against mock and real clients.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { MockBdappsClient } from "./mock.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("MockBdappsClient CAAS", () => {
  it("queryBalance returns S1000 with the seeded balance", async () => {
    vi.stubEnv("MOCK_BDAPPS_BALANCE", "80");
    const res = await new MockBdappsClient().queryBalance("01812345678");
    expect(res.statusCode).toBe("S1000");
    expect(res.chargeableBalance).toBe("80.00");
    expect(res.mock).toBe(true);
  });

  it("directDebit succeeds, decrements balance, echoes externalTrxId", async () => {
    const mock = new MockBdappsClient();
    const debit = await mock.directDebit({ mobile: "01812345678", amount: 30, externalTrxId: "AGS-1" });
    expect(debit.statusCode).toBe("S1000");
    expect(debit.externalTrxId).toBe("AGS-1");
    expect(debit.internalTrxId).toBeTruthy();
    const after = await mock.queryBalance("01812345678");
    expect(after.chargeableBalance).toBe("70.00");
  });

  it("directDebit returns E1326 when amount exceeds balance and keeps balance", async () => {
    const mock = new MockBdappsClient();
    const debit = await mock.directDebit({ mobile: "01812345678", amount: 5000 });
    expect(debit.statusCode).toBe("E1326");
    const after = await mock.queryBalance("01812345678");
    expect(after.chargeableBalance).toBe("100.00");
  });

  it("internalTrxIds are unique across debits", async () => {
    const mock = new MockBdappsClient();
    const a = await mock.directDebit({ mobile: "01812345678", amount: 1 });
    const b = await mock.directDebit({ mobile: "01812345678", amount: 1 });
    expect(a.internalTrxId).not.toBe(b.internalTrxId);
  });

  it("listPaymentInstruments offers Mobile Account", async () => {
    const res = await new MockBdappsClient().listPaymentInstruments("01812345678");
    expect(res.paymentInstrumentList).toEqual([{ name: "Mobile Account", type: "sync" }]);
  });
});

describe("MockBdappsClient OTP + SMS", () => {
  it("otp round-trip verifies with 123456 and returns a masked subscriberId", async () => {
    const mock = new MockBdappsClient();
    const req = await mock.requestOtp("01812345678");
    expect(req.statusCode).toBe("S1000");
    const ok = await mock.verifyOtp(req.referenceNo!, "123456");
    expect(ok.statusCode).toBe("S1000");
    expect(ok.subscriberId).toMatch(/^tel:masked_/);
  });

  it("wrong otp -> E1850, unknown reference -> E1851", async () => {
    const mock = new MockBdappsClient();
    const req = await mock.requestOtp("01812345678");
    expect((await mock.verifyOtp(req.referenceNo!, "000000")).statusCode).toBe("E1850");
    expect((await mock.verifyOtp("nope", "123456")).statusCode).toBe("E1851");
  });

  it("sendSms returns S1000 with per-destination responses", async () => {
    const res = await new MockBdappsClient().sendSms("01812345678", "hello");
    expect(res.statusCode).toBe("S1000");
    expect(res.destinationResponses?.[0]?.address).toBe("tel:8801812345678");
  });
});

describe("index.ts client selection", () => {
  it("exports the mock when MOCK_BDAPPS=1", async () => {
    vi.stubEnv("MOCK_BDAPPS", "1");
    const mod = await import("./index.js");
    expect(mod.isBdappsMocked).toBe(true);
    expect((mod.bdapps as { isMock?: boolean }).isMock).toBe(true);
  });

  it("exports the real client by default", async () => {
    vi.stubEnv("MOCK_BDAPPS", "");
    const mod = await import("./index.js");
    expect(mod.isBdappsMocked).toBe(false);
    expect((mod.bdapps as { isMock?: boolean }).isMock).toBeUndefined();
  });
});
