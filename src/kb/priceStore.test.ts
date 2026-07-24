import { describe, it, expect } from "vitest";
import { resolvePriceFrom, type PriceObservationLike } from "./priceStore.js";

const obs = (o: Partial<PriceObservationLike>): PriceObservationLike => ({
  tenantId: "hub",
  cropId: "rice_t_aman",
  price: 50,
  unit: "kg",
  priceType: "retail",
  observedAt: "2026-05-15",
  source: "WFP/HDX",
  dataOrigin: "real",
  ...o,
});

describe("resolvePriceFrom precedence (§4.4)", () => {
  it("tenant-local beats hub even for the same district", () => {
    const rows = [
      obs({ tenantId: "hub", district: "Kushtia", price: 50 }),
      obs({ tenantId: "dist-kushtia", district: "Kushtia", price: 55, source: "tenant:dist-kushtia", dataOrigin: "manual", observedAt: "2026-07-24" }),
    ];
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", district: "Kushtia", tenantId: "dist-kushtia" });
    expect(r?.pricePerKg).toBe(55);
    expect(r?.provenance.basis).toBe("local");
    expect(r?.provenance.tenantId).toBe("dist-kushtia");
  });

  it("hub same-district beats hub other markets", () => {
    const rows = [
      obs({ district: "Kushtia", market: "Kushtia Sadar", price: 50 }),
      obs({ district: "Dhaka", market: "Dhaka", price: 60 }),
    ];
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", district: "Kushtia" });
    expect(r?.pricePerKg).toBe(50);
    expect(r?.provenance.basis).toBe("hub_district");
  });

  it("falls back to nearest hub market by farm coords when no district match", () => {
    const rows = [
      obs({ district: "Dhaka", market: "Dhaka", price: 60, latitude: 23.81, longitude: 90.41 }),
      obs({ district: "Rangpur", market: "Rangpur", price: 45, latitude: 25.74, longitude: 89.27 }),
    ];
    // farm near Rangpur
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", farmLat: 25.7, farmLon: 89.3 });
    expect(r?.pricePerKg).toBe(45);
    expect(r?.provenance.basis).toBe("hub_nearest");
  });

  it("normalizes non-kg units to BDT/kg", () => {
    const rows = [obs({ district: "Kushtia", price: 5400, unit: "quintal" })];
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", district: "Kushtia" });
    expect(r?.pricePerKg).toBe(54); // 5400 / 100
  });

  it("never returns a mock row (Tier 0 isolation)", () => {
    const rows = [
      obs({ district: "Kushtia", price: 999, dataOrigin: "mock" }),
      obs({ district: "Kushtia", price: 50, dataOrigin: "real" }),
    ];
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", district: "Kushtia" });
    expect(r?.pricePerKg).toBe(50);
  });

  it("returns null when no non-mock candidate exists (no invention)", () => {
    const rows = [obs({ cropId: "maize", price: 30, dataOrigin: "mock" })];
    expect(resolvePriceFrom(rows, { cropId: "maize", district: "Kushtia" })).toBeNull();
  });

  it("picks the most recent observation within a tier", () => {
    const rows = [
      obs({ district: "Kushtia", price: 48, observedAt: "2026-03-15" }),
      obs({ district: "Kushtia", price: 54, observedAt: "2026-05-15" }),
    ];
    const r = resolvePriceFrom(rows, { cropId: "rice_t_aman", district: "Kushtia" });
    expect(r?.pricePerKg).toBe(54);
    expect(r?.provenance.observedAt).toBe("2026-05-15");
  });
});
