/**
 * Channel activation tests (P1): capture the masked id, resolve reachability,
 * and toggle premium — the write path behind every BDApps reach feature.
 */
import { describe, it, expect } from "vitest";
import { InMemoryChannelStore, activateChannel, isChannelActive } from "./channel.js";
import { getMaskedSubscriber } from "./subscriberStore.js";

const MASKED = "tel:MDUzYjE0MASKEDtest";

describe("channel activation", () => {
  it("activates a channel from a mobile + masked id and reports active", async () => {
    const store = new InMemoryChannelStore();
    const status = await activateChannel(
      { mobile: "01811111111", maskedSubscriberId: MASKED, source: "subscription_webhook", premium: true },
      store,
    );
    expect(status.active).toBe(true);
    expect(status.premium).toBe(true);
    expect(status.maskedSubscriberId).toBe(MASKED);
    expect(status.channelSource).toBe("subscription_webhook");

    // write-through to the outbound resolver
    expect(getMaskedSubscriber("01811111111")).toBe(MASKED);
    expect(await isChannelActive("01811111111", store)).toBe(true);
  });

  it("reports inactive for an unknown number", async () => {
    const store = new InMemoryChannelStore();
    expect(await isChannelActive("01822222222", store)).toBe(false);
    expect(await store.getByMobile("01822222222")).toBeUndefined();
  });

  it("looks a channel up by masked subscriberId", async () => {
    const store = new InMemoryChannelStore();
    await activateChannel(
      { mobile: "01833333333", maskedSubscriberId: "tel:MASKED33", source: "otp_verify" },
      store,
    );
    const found = await store.getBySubscriberId("tel:MASKED33");
    expect(found?.active).toBe(true);
  });

  it("toggles premium without losing the channel", async () => {
    const store = new InMemoryChannelStore();
    await activateChannel(
      { mobile: "01844444444", maskedSubscriberId: "tel:MASKED44", source: "inbound_sms" },
      store,
    );
    await store.setPremium("01844444444", true);
    expect((await store.getByMobile("01844444444"))?.premium).toBe(true);
    await store.setPremium("01844444444", false);
    const s = await store.getByMobile("01844444444");
    expect(s?.premium).toBe(false);
    expect(s?.active).toBe(true); // still reachable
  });
});
