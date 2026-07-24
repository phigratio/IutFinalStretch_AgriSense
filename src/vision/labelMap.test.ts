import { describe, expect, it } from "vitest";
import { diseaseSeverityHint, mapHfCropToCropId, parseLeafLabel } from "./labelMap.js";

describe("parseLeafLabel", () => {
  it("splits crop and condition on the ___ delimiter", () => {
    const parsed = parseLeafLabel("Tomato___Late_blight");
    expect(parsed.crop).toBe("tomato");
    expect(parsed.diseaseName).toBe("Late Blight");
    expect(parsed.healthy).toBe(false);
    expect(parsed.cropId).toBe("tomato");
  });

  it("maps Corn_(maize) to our maize cropId and strips the parenthetical", () => {
    const parsed = parseLeafLabel("Corn_(maize)___Common_rust_");
    expect(parsed.crop).toBe("corn");
    expect(parsed.cropId).toBe("maize");
    expect(parsed.diseaseName).toBe("Common Rust");
  });

  it("flags healthy labels", () => {
    const parsed = parseLeafLabel("Potato___healthy");
    expect(parsed.healthy).toBe(true);
    expect(parsed.diseaseName).toBe("Healthy");
    expect(parsed.cropId).toBe("potato");
  });

  it("leaves cropId undefined for crops we do not model (e.g. apple)", () => {
    const parsed = parseLeafLabel("Apple___Apple_scab");
    expect(parsed.cropId).toBeUndefined();
    expect(parsed.diseaseName).toBe("Apple Scab");
  });
});

describe("mapHfCropToCropId", () => {
  it("maps known crops and returns undefined otherwise", () => {
    expect(mapHfCropToCropId("Tomato")).toBe("tomato");
    expect(mapHfCropToCropId("potato")).toBe("potato");
    expect(mapHfCropToCropId("Corn (maize)")).toBe("maize");
    expect(mapHfCropToCropId("Grape")).toBeUndefined();
  });
});

describe("diseaseSeverityHint", () => {
  it("rates blights/blast high, spots/rust medium, healthy none", () => {
    expect(diseaseSeverityHint("late blight")).toBe("high");
    expect(diseaseSeverityHint("bacterial spot")).toBe("medium");
    expect(diseaseSeverityHint("healthy")).toBe("none");
  });
});
