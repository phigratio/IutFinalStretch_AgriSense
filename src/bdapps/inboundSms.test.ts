/**
 * Inbound SMS keyword router tests (P4): command parsing, the START channel
 * opt-in (captures the masked address), and keyword replies with/without data.
 */
import { describe, it, expect } from "vitest";
import { parseCommand, handleInboundSms, type InboundData } from "./inboundSms.js";
import { InMemoryChannelStore } from "./channel.js";
import type { IncomingSms } from "./types.js";

const MASKED = "tel:MDUzINBOUNDtest";
function sms(message: string): IncomingSms {
  return { message, sourceAddress: MASKED };
}

const data: InboundData = {
  planSummary: async () => "AgriSense: rice plan — expected net Tk 16,545, ROI 42%.",
  weatherSummary: async () => "AgriSense weather (Bogra): today 1.4mm rain, 25-32C.",
};

describe("parseCommand", () => {
  it("maps aliases case-insensitively", () => {
    expect(parseCommand("start").cmd).toBe("START");
    expect(parseCommand("JOIN").cmd).toBe("START");
    expect(parseCommand("stop").cmd).toBe("STOP");
    expect(parseCommand("Plan").cmd).toBe("PLAN");
    expect(parseCommand("weather").cmd).toBe("WEATHER");
    expect(parseCommand("").cmd).toBe("HELP");
    expect(parseCommand("gibberish").cmd).toBe("UNKNOWN");
  });
});

describe("handleInboundSms", () => {
  it("START activates the channel from the inbound masked address", async () => {
    const channel = new InMemoryChannelStore();
    const res = await handleInboundSms(sms("START"), { channel });
    expect(res.command).toBe("START");
    expect(res.reply).toMatch(/welcome/i);
    expect((await channel.getBySubscriberId(MASKED))?.active).toBe(true);
  });

  it("PLAN and WEATHER return data-backed replies when available", async () => {
    const channel = new InMemoryChannelStore();
    expect((await handleInboundSms(sms("PLAN"), { channel, data })).reply).toMatch(/rice plan/);
    expect((await handleInboundSms(sms("WEATHER"), { channel, data })).reply).toMatch(/Bogra/);
  });

  it("PLAN falls back gracefully with no data provider", async () => {
    const channel = new InMemoryChannelStore();
    const res = await handleInboundSms(sms("PLAN"), { channel });
    expect(res.reply).toMatch(/no season plan/i);
  });

  it("unknown / empty → HELP menu", async () => {
    const channel = new InMemoryChannelStore();
    expect((await handleInboundSms(sms("xyz"), { channel })).reply).toMatch(/reply START/i);
  });
});
