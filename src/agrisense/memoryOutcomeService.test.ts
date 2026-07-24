import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryMemoryOutcomeService, type MemoryOutcome } from "./memoryOutcomeService.js";

const now = new Date("2026-07-24T12:00:00Z").toISOString();

function outcome(input: Partial<MemoryOutcome>): MemoryOutcome {
  return {
    id: input.id ?? randomUUID(),
    kind: input.kind ?? "farm_fact",
    title: input.title ?? "Farm profile",
    summary: input.summary ?? "Gazipur · 2 acres · sandy loam",
    valueJson: input.valueJson ?? {},
    score: input.score ?? 50,
    sourceTraceIds: input.sourceTraceIds ?? [],
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    userId: input.userId,
    farmerId: input.farmerId,
    farmId: input.farmId,
    sessionId: input.sessionId,
    planId: input.planId,
  };
}

describe("MemoryOutcomeService", () => {
  it("ranks matching outcomes by usefulness score", async () => {
    const service = new InMemoryMemoryOutcomeService([
      outcome({ id: "low", farmerId: "farmer-1", score: 20 }),
      outcome({ id: "high", farmerId: "farmer-1", score: 95 }),
      outcome({ id: "other", farmerId: "farmer-2", score: 100 }),
    ]);

    const result = await service.list({ farmerId: "farmer-1" });

    expect(result.outcomes.map((item) => item.id)).toEqual(["high", "low"]);
  });

  it("applies accepted farm facts to an incomplete profile", () => {
    const service = new InMemoryMemoryOutcomeService();
    const applied = service.applyToProfile(
      { sessionId: "session-1", farmerId: "farmer-1", farmId: "farm-1" },
      [
        outcome({
          id: "fact-1",
          farmerId: "farmer-1",
          valueJson: {
            locationText: "Gazipur",
            sizeAcres: 2,
            soilType: "Sandy Loam",
            waterAvailability: "rainfed",
            budgetBdt: 45000,
            targetSeason: "Aman",
          },
        }),
      ],
      ["fact-1"],
    );

    expect(applied).toMatchObject({
      locationText: "Gazipur",
      sizeAcres: 2,
      soilType: "sandy loam",
      waterAvailability: "rainfed",
      budgetBdt: 45000,
      targetSeason: "Aman",
    });
  });
});
