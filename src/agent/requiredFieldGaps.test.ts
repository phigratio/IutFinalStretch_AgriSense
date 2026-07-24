import { describe, expect, it } from "vitest";
import { mergeProfilePatch, requiredFieldGaps } from "./requiredFieldGaps.js";

describe("requiredFieldGaps", () => {
  it("returns every required intake field for an empty profile", () => {
    expect(requiredFieldGaps({})).toEqual([
      "location",
      "farmSize",
      "soilType",
      "waterAvailability",
      "budget",
      "targetSeason",
    ]);
  });

  it("returns only fields still missing", () => {
    expect(
      requiredFieldGaps({
        locationText: "Gazipur",
        sizeAcres: 2,
        soilType: "sandy loam",
        waterAvailability: "rainfed",
      }),
    ).toEqual(["budget", "targetSeason"]);
  });

  it("merges new durable facts without erasing existing known facts", () => {
    expect(
      mergeProfilePatch(
        { locationText: "Gazipur", sizeAcres: 2 },
        { budgetBdt: 45000, locationText: "" },
      ),
    ).toMatchObject({
      locationText: "Gazipur",
      sizeAcres: 2,
      budgetBdt: 45000,
    });
  });
});

