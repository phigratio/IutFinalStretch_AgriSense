import { describe, expect, it } from "vitest";
import { IntakeService } from "./intakeService.js";
import { InMemoryIntakeStore } from "./intakeStore.js";
import { HeuristicIntakeExtractor, type IntakeExtractor } from "./extractIntakeProfile.js";
import { type IntakeProfile, type IntakeProfilePatch } from "./intakeSchema.js";

class QueueExtractor implements IntakeExtractor {
  constructor(private readonly patches: IntakeProfilePatch[]) {}

  async extract(_message: string, _currentProfile: IntakeProfile): Promise<IntakeProfilePatch> {
    return this.patches.shift() ?? {};
  }
}

describe("IntakeService", () => {
  it("asks for all required fields from a vague opener", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(store, new QueueExtractor([{}]));

    const result = await service.handleTurn({ message: "I have some land, what should I plant?" });

    expect(result.intakeComplete).toBe(false);
    expect(result.missingFields).toEqual([
      "location",
      "farmSize",
      "soilType",
      "waterAvailability",
      "budget",
      "targetSeason",
    ]);
    expect(result.reply).toContain("where the land is");
    expect(result.trace.map((event) => event.toolName)).toEqual([
      "memory.search",
      "language.detect",
      "extract_intake_profile",
      "profile.merge",
      "requiredFieldGaps",
      "save_farm_profile",
      "mem0.memory.add",
    ]);
  });

  it("asks only for fields that are still missing after a partial profile", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(
      store,
      new QueueExtractor([
        {
          locationText: "Gazipur",
          sizeAcres: 2,
          soilType: "sandy loam",
          waterAvailability: "rainfed",
        },
      ]),
    );

    const result = await service.handleTurn({ message: "2 acres in Gazipur, sandy loam, rainfed" });

    expect(result.missingFields).toEqual(["budget", "targetSeason"]);
    expect(result.reply).toContain("budget in BDT");
    expect(result.reply).toContain("target season");
    expect(result.reply).not.toContain("where the land is");
  });

  it("completes intake and plans the next tools when all required fields exist", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(
      store,
      new QueueExtractor([
        {
          locationText: "Gazipur",
          sizeAcres: 2,
          soilType: "sandy loam",
          waterAvailability: "rainfed",
          budgetBdt: 45000,
          targetSeason: "Aman",
        },
      ]),
    );

    const result = await service.handleTurn({
      message: "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman",
    });

    expect(result.intakeComplete).toBe(true);
    expect(result.missingFields).toEqual([]);
    expect(result.nextStep?.plannedTools).toEqual([
      "geocode_location",
      "get_weather",
      "query_knowledge_base",
      "rank_crops",
    ]);
    expect(result.reply).toContain("Intake complete");
  });

  it("carries context across turns and never re-asks known fields", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(
      store,
      new QueueExtractor([
        {
          locationText: "Bogura",
          sizeAcres: 1,
          soilType: "loam",
        },
        {
          waterAvailability: "tubewell",
          budgetBdt: 40000,
          targetSeason: "Boro",
        },
      ]),
    );

    const first = await service.handleTurn({ message: "I have 1 acre loam land in Bogura" });
    const second = await service.handleTurn({
      sessionId: first.sessionId,
      message: "Tubewell water, budget 40k, Boro",
    });

    expect(first.missingFields).toEqual(["waterAvailability", "budget", "targetSeason"]);
    expect(second.intakeComplete).toBe(true);
    expect(second.profile).toMatchObject({
      locationText: "Bogura",
      sizeAcres: 1,
      soilType: "loam",
      waterAvailability: "tubewell",
      budgetBdt: 40000,
      targetSeason: "Boro",
    });
  });

  it("extracts Banglish farmer details and asks only for the farm size still missing", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(store, new HeuristicIntakeExtractor());

    const result = await service.handleTurn({
      message:
        "the land is in dhaka, soil type is bele, water is from nearby river and rain, budget is 400 tk daily and target season is monsoon",
    });

    expect(result.profile).toMatchObject({
      locationText: "Dhaka",
      soilType: "sandy",
      waterAvailability: "mixed",
      budgetBdt: 400,
      targetSeason: "Monsoon",
    });
    expect(result.missingFields).toEqual(["farmSize"]);
    expect(result.reply).toContain("how large the farm is");
  });

  it("detects Bangla script, stores preference, and replies in Bangla", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(store, new HeuristicIntakeExtractor());

    const result = await service.handleTurn({
      message: "আমার গাজীপুরে ২ একর জমি, বেলে দোআঁশ মাটি, বৃষ্টির পানি, বাজেট ৪৫ হাজার, আমন",
    });

    expect(result.profile.preferredLanguage).toBe("bn");
    expect(result.profile).toMatchObject({
      soilType: "sandy loam",
      waterAvailability: "rainfed",
      budgetBdt: 45000,
      targetSeason: "Aman",
    });
    expect(result.reply).toContain("ইনটেক সম্পূর্ণ");
  });

  it("keeps Banglish as a separate preferred language", async () => {
    const store = new InMemoryIntakeStore();
    const service = new IntakeService(store, new HeuristicIntakeExtractor());

    const result = await service.handleTurn({
      message: "amar jomi Gazipur e, bele mati, nodi ar brishti pani, budget 30k, Aman",
    });

    expect(result.profile.preferredLanguage).toBe("banglish");
    expect(result.reply).toContain("jomi koto boro");
  });
});
