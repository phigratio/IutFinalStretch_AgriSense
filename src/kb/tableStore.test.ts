import { describe, it, expect } from "vitest";
import { resolveTableFrom, type TableOverride } from "./tableStore.js";

const ov = (o: Partial<TableOverride>): TableOverride => ({
  tenantId: "hub",
  kind: "fertilizer",
  cropId: "rice_boro",
  payload: { urea: 260 },
  source: "FRG-2018",
  dataOrigin: "manual",
  ...o,
});

const csvBaseline = () => ({ urea: 250, source: "csv" });

describe("resolveTableFrom precedence (K2)", () => {
  it("tenant override beats hub override beats CSV", () => {
    const rows = [
      ov({ tenantId: "hub", payload: { urea: 260 } }),
      ov({ tenantId: "dist-kushtia", district: "Kushtia", payload: { urea: 275 } }),
    ];
    const r = resolveTableFrom(rows, { kind: "fertilizer", cropId: "rice_boro", tenantId: "dist-kushtia", district: "Kushtia" }, csvBaseline);
    expect(r?.payload).toEqual({ urea: 275 });
    expect(r?.provenance.basis).toBe("tenant");
  });

  it("hub override used when no tenant override", () => {
    const rows = [ov({ tenantId: "hub", payload: { urea: 260 } })];
    const r = resolveTableFrom(rows, { kind: "fertilizer", cropId: "rice_boro", tenantId: "dist-kushtia" }, csvBaseline);
    expect(r?.payload).toEqual({ urea: 260 });
    expect(r?.provenance.basis).toBe("hub");
  });

  it("falls back to CSV baseline when no override exists", () => {
    const r = resolveTableFrom([], { kind: "fertilizer", cropId: "rice_boro", tenantId: "dist-kushtia" }, csvBaseline);
    expect(r?.payload).toEqual({ urea: 250, source: "csv" });
    expect(r?.provenance.basis).toBe("csv");
  });

  it("prefers a district-specific override over a district-less one", () => {
    const rows = [
      ov({ tenantId: "dist-kushtia", district: undefined, payload: { urea: 270 } }),
      ov({ tenantId: "dist-kushtia", district: "Kushtia", payload: { urea: 280 } }),
    ];
    const r = resolveTableFrom(rows, { kind: "fertilizer", cropId: "rice_boro", tenantId: "dist-kushtia", district: "Kushtia" }, csvBaseline);
    expect(r?.payload).toEqual({ urea: 280 });
  });

  it("never uses a mock override", () => {
    const rows = [ov({ tenantId: "dist-kushtia", district: "Kushtia", payload: { urea: 999 }, dataOrigin: "mock" })];
    const r = resolveTableFrom(rows, { kind: "fertilizer", cropId: "rice_boro", tenantId: "dist-kushtia", district: "Kushtia" }, csvBaseline);
    expect(r?.payload).toEqual({ urea: 250, source: "csv" }); // mock skipped -> CSV
    expect(r?.provenance.basis).toBe("csv");
  });

  it("returns null when nothing is available", () => {
    const r = resolveTableFrom([], { kind: "fertilizer", cropId: "rice_boro" }, () => undefined);
    expect(r).toBeNull();
  });
});
