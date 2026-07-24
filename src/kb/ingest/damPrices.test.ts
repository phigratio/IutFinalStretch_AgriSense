import { describe, expect, it } from "vitest";
import { parseDamPriceText } from "./damPrices.js";

describe("DAM PDF text parser", () => {
  it("imports unambiguous ranges and skips malformed lines", () => {
    const rows = parseDamPriceText("Potato retail 35 45\nOnion unavailable\nWheat wholesale 50 48", { observedAt: "2026-07-24" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ cropId: "potato", price: 40, unit: "kg", dataOrigin: "manual", source: "DAM daily PDF" });
  });
});
