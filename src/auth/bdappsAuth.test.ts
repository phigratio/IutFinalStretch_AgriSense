/**
 * BDApps phone-identity tests (P3): OTP request/verify establishes the shared
 * AppUser (role "user"), issues a token, and activates the channel — all
 * additive to the existing AuthStore, never a separate login silo.
 */
import { describe, it, expect } from "vitest";
import { BdappsAuthService } from "./bdappsAuth.js";
import { InMemoryAuthStore } from "./store.js";
import { MockBdappsClient } from "../bdapps/mock.js";
import { InMemoryChannelStore } from "../bdapps/channel.js";

function make() {
  const store = new InMemoryAuthStore();
  const client = new MockBdappsClient();
  const channel = new InMemoryChannelStore();
  return { store, service: new BdappsAuthService(store, client, channel) };
}

describe("BdappsAuthService", () => {
  it("requestOtp returns a referenceNo", async () => {
    const { service } = make();
    const res = await service.requestOtp("01812345678");
    expect(res.referenceNo).toBeTruthy();
  });

  it("verifyOtp creates a shared 'user' AppUser + token and activates the channel", async () => {
    const { service } = make();
    const { referenceNo } = await service.requestOtp("01812345678");
    const res = await service.verifyOtp({ referenceNo, otp: "123456", mobile: "01812345678" });

    expect(res.accessToken).toBeTruthy();
    expect(res.tokenType).toBe("Bearer");
    expect(res.user.role).toBe("user");
    expect(res.user.email).toContain("@bdapps.agrisense.local");
    expect(res.channelActive).toBe(true); // mock returns a masked subscriberId
  });

  it("is idempotent — same phone resolves to the same AppUser", async () => {
    const { service } = make();
    const r1 = await service.requestOtp("01899999999");
    const v1 = await service.verifyOtp({ referenceNo: r1.referenceNo, otp: "123456", mobile: "01899999999" });
    const r2 = await service.requestOtp("01899999999");
    const v2 = await service.verifyOtp({ referenceNo: r2.referenceNo, otp: "123456", mobile: "01899999999" });
    expect(v1.user.id).toBe(v2.user.id);
  });

  it("rejects a wrong OTP", async () => {
    const { service } = make();
    const { referenceNo } = await service.requestOtp("01812345678");
    await expect(service.verifyOtp({ referenceNo, otp: "000000", mobile: "01812345678" })).rejects.toThrow(/verification failed/i);
  });

  it("rejects an invalid mobile number", async () => {
    const { service } = make();
    await expect(service.requestOtp("12345")).rejects.toThrow(/mobile|invalid/i);
  });
});
