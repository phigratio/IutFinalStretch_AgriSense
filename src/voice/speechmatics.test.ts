import { describe, it, expect, vi } from "vitest";
import { transcribeSpeechmatics } from "./speechmatics.js";

vi.mock("../config.js", () => ({
  config: { speechmaticApiKey: "test-key", speechmaticUrl: "https://asr.test/v2" },
}));

const json = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body, text: async () => JSON.stringify(body) }) as unknown as Response;
const text = (body: string, ok = true, status = 200) =>
  ({ ok, status, text: async () => body, json: async () => ({}) }) as unknown as Response;

describe("transcribeSpeechmatics (batch flow)", () => {
  it("creates a job, polls until done, and returns the transcript", async () => {
    const calls: string[] = [];
    const fetchFn = vi.fn(async (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/jobs") && init?.method === "POST") return json({ id: "job-1" });
      if (url.endsWith("/jobs/job-1")) return json({ job: { status: "done" } });
      if (url.includes("/transcript")) return text("আমার দুই বিঘা জমি\n");
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;

    const out = await transcribeSpeechmatics(Buffer.from("x"), "rec.webm", "audio/webm", {
      language: "bn",
      timeoutMs: 10_000,
      fetchFn,
    });

    expect(out).toBe("আমার দুই বিঘা জমি");
    expect(calls[0]).toBe("POST https://asr.test/v2/jobs");
    expect(calls.some((c) => c.includes("/transcript?format=txt"))).toBe(true);
  });

  it("throws when Speechmatics rejects the audio", async () => {
    const fetchFn = vi.fn(async (url: string, init?: { method?: string }) => {
      if (url.endsWith("/jobs") && init?.method === "POST") return json({ id: "job-2" });
      return json({ job: { status: "rejected", errors: [{ message: "bad audio" }] } });
    }) as unknown as typeof fetch;

    await expect(
      transcribeSpeechmatics(Buffer.from("x"), "rec.webm", "audio/webm", { timeoutMs: 10_000, fetchFn }),
    ).rejects.toThrow(/rejected/i);
  });
});
