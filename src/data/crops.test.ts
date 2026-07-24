import { describe, it, expect } from "vitest";
import { CROP_IDS, resolveCrop, resolveCropId, isCropId } from "./crops.js";

describe("crop resolution", () => {
  it("has exactly the 8 canonical crops", () => {
    expect(CROP_IDS).toHaveLength(8);
    expect(new Set(CROP_IDS).size).toBe(8);
  });

  it("resolves English aliases", () => {
    expect(resolveCropId("T. Aman")).toBe("rice_t_aman");
    expect(resolveCropId("Transplanted Aman")).toBe("rice_t_aman");
    expect(resolveCropId("boro")).toBe("rice_boro");
    expect(resolveCropId("wheat")).toBe("wheat");
    expect(resolveCropId("potatoes")).toBe("potato");
    expect(resolveCropId("masur")).toBe("lentil");
  });

  it("resolves Bangla aliases", () => {
    expect(resolveCropId("রোপা আমন")).toBe("rice_t_aman");
    expect(resolveCropId("বোরো ধান")).toBe("rice_boro");
    expect(resolveCropId("আলু")).toBe("potato");
    expect(resolveCropId("সরিষা")).toBe("mustard");
    expect(resolveCropId("পেঁয়াজ")).toBe("onion");
  });

  it("resolves inside a sentence, longest alias wins", () => {
    expect(resolveCropId("I want to grow boro rice this season")).toBe("rice_boro");
    expect(resolveCropId("planning transplanted aman")).toBe("rice_t_aman");
  });

  it("flags bare rice/dhan as ambiguous (never guesses Aman vs Boro)", () => {
    expect(resolveCrop("rice")).toEqual({ cropId: null, ambiguous: true });
    expect(resolveCrop("ধান")).toEqual({ cropId: null, ambiguous: true });
    expect(resolveCropId("rice")).toBeNull();
  });

  it("returns null (not ambiguous) for unknown crops", () => {
    expect(resolveCrop("banana")).toEqual({ cropId: null, ambiguous: false });
  });

  it("passes through canonical IDs and validates them", () => {
    for (const id of CROP_IDS) {
      expect(isCropId(id)).toBe(true);
      expect(resolveCropId(id)).toBe(id);
    }
    expect(isCropId("rice")).toBe(false);
  });
});
