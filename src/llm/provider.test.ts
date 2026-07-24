import { describe, it, expect } from "vitest";
import {
  parseExtractionToolCall,
  parseBudget,
  OpenAIExtractor,
  HeuristicExtractor,
  type ChatFetch,
} from "./provider.js";

describe("parseExtractionToolCall", () => {
  it("extracts tool-call arguments from an OpenAI response", () => {
    const body = JSON.stringify({
      choices: [
        {
          message: {
            tool_calls: [
              { function: { name: "extract_farm_fields", arguments: '{"district":"Kushtia","areaValue":2,"areaUnit":"acre"}' } },
            ],
          },
        },
      ],
    });
    expect(parseExtractionToolCall(body)).toEqual({ district: "Kushtia", areaValue: 2, areaUnit: "acre" });
  });

  it("returns {} when there is no tool call", () => {
    expect(parseExtractionToolCall(JSON.stringify({ choices: [{ message: {} }] }))).toEqual({});
  });
});

describe("OpenAIExtractor (injected fetch, no network)", () => {
  it("builds a request and parses the tool call", async () => {
    let sawAuth = "";
    const fetchFn: ChatFetch = async (_url, init) => {
      sawAuth = (init.headers as Record<string, string>).authorization;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { tool_calls: [{ function: { arguments: '{"budgetBdt":80000}' } }] } }],
          }),
      };
    };
    const ex = new OpenAIExtractor("sk-test", "gpt-4o", fetchFn);
    const out = await ex.extract("my budget is 80 thousand", {});
    expect(out).toEqual({ budgetBdt: 80000 });
    expect(sawAuth).toBe("Bearer sk-test");
  });
});

describe("parseBudget", () => {
  it("parses common taka expressions", () => {
    expect(parseBudget("budget 80000")).toBe(80000);
    expect(parseBudget("80,000 taka")).toBe(80000);
    expect(parseBudget("80k")).toBe(80000);
    expect(parseBudget("1 lakh")).toBe(100000);
    expect(parseBudget("tk 50000")).toBe(50000);
  });
  it("ignores bare numbers with no money keyword", () => {
    expect(parseBudget("I have 2 acres")).toBeNull();
  });
});

describe("HeuristicExtractor (offline fallback)", () => {
  it("pulls area, soil, season, water, budget, district from one message", async () => {
    const ex = new HeuristicExtractor();
    const out = await ex.extract(
      "I'm in Kushtia with 2 acres of loam soil, reliable irrigation, budget 80000, planning Boro",
    );
    expect(out.district).toBe("Kushtia");
    expect(out.areaValue).toBe(2);
    expect(out.areaUnit).toBe("acre");
    expect(out.soilText).toBeTruthy();
    expect(out.seasonText).toBeTruthy();
    expect(out.waterText).toBeTruthy();
    expect(out.budgetBdt).toBe(80000);
  });

  it("handles Bangla area '২ বিঘা'", async () => {
    const out = await new HeuristicExtractor().extract("আমার ২ বিঘা জমি");
    expect(out.areaValue).toBe(2);
    expect(out.areaUnit).toBe("bigha");
  });
});
