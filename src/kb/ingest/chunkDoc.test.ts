import { describe, it, expect } from "vitest";
import { chunkText, estimateTokens } from "./chunkDoc.js";

const sentence = (n: number) => `This is sentence number ${n} about rice cultivation and fertilizer timing.`;
const longDoc = Array.from({ length: 200 }, (_, i) => sentence(i + 1)).join(" ");

describe("chunkText", () => {
  it("returns a single chunk for short text", () => {
    const chunks = chunkText("Apply urea when the soil is dry. Avoid rain days.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].ordinal).toBe(0);
  });

  it("splits a long doc into multiple sequentially-numbered chunks near the target size", () => {
    const chunks = chunkText(longDoc, { targetTokens: 120, overlapTokens: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c, i) => expect(c.ordinal).toBe(i));
    // no chunk wildly over target (allow a sentence's worth of slack)
    for (const c of chunks) expect(c.approxTokens).toBeLessThan(160);
  });

  it("respects sentence boundaries (no mid-sentence cuts)", () => {
    const chunks = chunkText(longDoc, { targetTokens: 100, overlapTokens: 0 });
    for (const c of chunks) {
      expect(c.text).toMatch(/[.!?]$/); // ends on a sentence terminator
    }
  });

  it("adds overlap between consecutive chunks", () => {
    const chunks = chunkText(longDoc, { targetTokens: 100, overlapTokens: 30 });
    // chunk 1 starts with sentences carried over from the end of chunk 0
    const firstOf1 = chunks[1].text.split(/(?<=[.!?])\s+/)[0];
    expect(chunks[0].text.includes(firstOf1)).toBe(true);
  });

  it("handles empty input", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("estimateTokens grows with length", () => {
    expect(estimateTokens("one two three")).toBeGreaterThan(0);
    expect(estimateTokens(longDoc)).toBeGreaterThan(estimateTokens(sentence(1)));
  });
});
