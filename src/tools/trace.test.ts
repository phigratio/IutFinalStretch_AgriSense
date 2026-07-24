import { describe, it, expect } from "vitest";
import { InMemoryTraceWriter, withTrace } from "./trace.js";

describe("withTrace", () => {
  it("records one success event with the raw response and a step id", async () => {
    const w = new InMemoryTraceWriter();
    const result = await withTrace(
      w,
      { toolName: "get_forecast", purpose: "crop_ranking.weatherFit", parameters: { lat: 23.9 } },
      () => ({ totalRainNext7Mm: 42.3 }),
    );

    expect(result).toEqual({ totalRainNext7Mm: 42.3 });
    expect(w.events).toHaveLength(1);
    const e = w.events[0];
    expect(e.status).toBe("success");
    expect(e.stepId).toBe("get_forecast_001");
    expect(e.rawResponse).toEqual({ totalRainNext7Mm: 42.3 });
    expect(e.purpose).toBe("crop_ranking.weatherFit");
    expect(e.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records a failure event and re-throws (never swallows)", async () => {
    const w = new InMemoryTraceWriter();
    await expect(
      withTrace(w, { toolName: "get_forecast" }, () => {
        throw new Error("network down");
      }),
    ).rejects.toThrow("network down");

    expect(w.events).toHaveLength(1);
    expect(w.events[0].status).toBe("error");
    expect(w.events[0].errorMessage).toBe("network down");
  });

  it("issues monotonic, per-tool step ids", async () => {
    const w = new InMemoryTraceWriter();
    await withTrace(w, { toolName: "get_forecast" }, () => 1);
    await withTrace(w, { toolName: "get_forecast" }, () => 2);
    await withTrace(w, { toolName: "geocode" }, () => 3);
    expect(w.events.map((e) => e.stepId)).toEqual([
      "get_forecast_001",
      "get_forecast_002",
      "geocode_001",
    ]);
  });
});
