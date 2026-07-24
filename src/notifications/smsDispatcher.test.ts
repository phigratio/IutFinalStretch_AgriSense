/**
 * Alert SMS delivery tests (P2): message formatting, channel-target resolution,
 * and the per-alert send decision (sent / skipped_no_channel / failed).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { formatAlertMessage, resolveAlertTarget, deliverOne, type PendingAlertRow } from "./smsDispatcher.js";
import { MockBdappsClient } from "../bdapps/mock.js";
import { setMaskedSubscriber } from "../bdapps/subscriberStore.js";

const MASKED = "tel:MDUzALERTtest";

function row(overrides: Partial<PendingAlertRow> = {}): PendingAlertRow {
  return {
    id: "a1",
    title: "Heavy rain risk",
    message: "34mm rain forecast in 4 days.",
    recommendation: "Delay urea top-dress.",
    severity: "warning",
    bdappsMobile: "01805758966",
    bdappsSubscriberId: null,
    preferredLanguage: "en",
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("formatAlertMessage", () => {
  it("builds a farmer-friendly one-liner with a severity icon", () => {
    const text = formatAlertMessage(row());
    expect(text).toContain("AgriSense");
    expect(text).toContain("⚠️");
    expect(text).toContain("Heavy rain risk");
    expect(text).toContain("Delay urea top-dress.");
  });
});

describe("resolveAlertTarget", () => {
  it("prefers the persisted masked subscriberId", () => {
    expect(resolveAlertTarget({ bdappsMobile: "01700000000", bdappsSubscriberId: MASKED })).toBe(MASKED);
  });
  it("falls back to the in-memory resolver (env-seed / prior capture)", () => {
    setMaskedSubscriber("01711111111", "tel:SEEDED11");
    expect(resolveAlertTarget({ bdappsMobile: "01711111111", bdappsSubscriberId: null })).toBe("tel:SEEDED11");
  });
  it("returns undefined when the channel is inactive", () => {
    expect(resolveAlertTarget({ bdappsMobile: "01999999999", bdappsSubscriberId: null })).toBeUndefined();
  });
});

describe("deliverOne", () => {
  it("sends and returns the messageId when the channel is active", async () => {
    const res = await deliverOne(row({ bdappsSubscriberId: MASKED }), new MockBdappsClient());
    expect(res.status).toBe("sent");
    expect(res.smsMessageId).toBeTruthy();
  });

  it("skips (no channel) when there is no masked id", async () => {
    const res = await deliverOne(row({ bdappsMobile: "01888888888", bdappsSubscriberId: null }), new MockBdappsClient());
    expect(res.status).toBe("skipped_no_channel");
  });

  it("reports failed when the SMS send throws", async () => {
    const bad = new MockBdappsClient();
    bad.sendSms = async () => {
      throw new Error("gateway down");
    };
    const res = await deliverOne(row({ bdappsSubscriberId: MASKED }), bad);
    expect(res.status).toBe("failed");
  });
});
