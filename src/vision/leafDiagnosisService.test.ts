import { describe, expect, it, vi } from "vitest";
import { LeafDiagnosisService, type LeafDiagnosisDeps, type UploadedImage } from "./leafDiagnosisService.js";
import { type HfClassification } from "./hfClient.js";
import { type OpenAiLeafDiagnosis } from "./openaiVision.js";
import { type PestContext } from "../pest/pestRiskService.js";
import { type WeatherForecast } from "../agrisense/types.js";

function image(): UploadedImage {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { originalname: "leaf.png", mimetype: "image/png", size: buffer.length, buffer };
}

function fakeWeather(): WeatherForecast {
  return {
    provider: "mock",
    locationText: "Bogura",
    latitude: 24.85,
    longitude: 89.37,
    daily: [{ date: "2026-07-25", rainfallMm: 12, temperatureMinC: 26, temperatureMaxC: 33, humidityPct: 88 }],
    raw: {},
  };
}

function fakeAi(overrides: Partial<OpenAiLeafDiagnosis> = {}): OpenAiLeafDiagnosis {
  return {
    isLeaf: true,
    crop: "rice",
    disease: "Rice Blast",
    confidence: 0.72,
    severity: "high",
    symptoms: "diamond-shaped lesions on leaves",
    differentials: ["Brown spot"],
    treatment: "Apply a tricyclazole-based fungicide per label.",
    prevention: "Avoid excess nitrogen; keep the canopy dry.",
    notes: "",
    ...overrides,
  };
}

function deps(over: {
  labels?: HfClassification[];
  hfConfigured?: boolean;
  visionConfigured?: boolean;
  ai?: OpenAiLeafDiagnosis;
  context?: PestContext;
  classifyError?: boolean;
}): { deps: Partial<LeafDiagnosisDeps>; diagnose: ReturnType<typeof vi.fn> } {
  const diagnose = vi.fn(async () => over.ai ?? fakeAi());
  return {
    diagnose,
    deps: {
      classifier: {
        configured: over.hfConfigured ?? true,
        classify: vi.fn(async () => {
          if (over.classifyError) throw new Error("HF 503 model loading");
          return over.labels ?? [];
        }),
      },
      vision: { configured: over.visionConfigured ?? true, diagnose },
      loadContext: vi.fn(async () => over.context ?? {}),
      getWeather: vi.fn(async () => fakeWeather()),
    },
  };
}

describe("LeafDiagnosisService", () => {
  it("accepts a confident, crop-compatible HuggingFace prediction (no fallback)", async () => {
    const { deps: d, diagnose } = deps({
      labels: [{ label: "Potato___Late_blight", score: 0.95 }],
      context: { crop: "potato", locationText: "Bogura", areaAcres: 2 },
    });
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), crop: "potato", save: false, createAlerts: false });

    expect(result.source).toBe("hf");
    expect(result.disease).toBe("Late Blight");
    expect(result.confidence).toBe(0.95);
    expect(result.caution).toBeUndefined();
    expect(diagnose).not.toHaveBeenCalled();
    expect(result.trace.some((e) => e.toolName === "leaf.hf.classify")).toBe(true);
  });

  it("falls back to OpenAI vision when HF confidence is below threshold", async () => {
    const { deps: d, diagnose } = deps({
      labels: [{ label: "Tomato___Early_blight", score: 0.2 }],
      context: { locationText: "Bogura" },
    });
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), locationText: "Bogura", save: false, createAlerts: false });

    expect(result.source).toBe("openai");
    expect(result.disease).toBe("Rice Blast");
    expect(result.caution).toBeTruthy();
    expect(diagnose).toHaveBeenCalledOnce();
    expect(result.trace.some((e) => e.toolName === "leaf.openai.diagnose")).toBe(true);
  });

  it("falls back when the HF crop conflicts with the farm's crop (e.g. rice)", async () => {
    const { deps: d, diagnose } = deps({
      labels: [{ label: "Tomato___Late_blight", score: 0.97 }],
      context: { crop: "rice_boro", locationText: "Bogura" },
    });
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), save: false, createAlerts: false });

    expect(result.source).toBe("openai");
    expect(diagnose).toHaveBeenCalledOnce();
    expect(result.decisionReason).toMatch(/conflict/i);
  });

  it("falls back to OpenAI when HF has no token", async () => {
    const { deps: d, diagnose } = deps({ hfConfigured: false, context: { locationText: "Bogura" } });
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), locationText: "Bogura", save: false, createAlerts: false });

    expect(result.source).toBe("openai");
    expect(diagnose).toHaveBeenCalledOnce();
  });

  it("degrades gracefully when neither model is available (no throw)", async () => {
    const { deps: d } = deps({ hfConfigured: false, visionConfigured: false });
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), save: false, createAlerts: false });

    expect(result.source).toBe("unavailable");
    expect(result.disease).toBe("Uncertain");
    expect(result.caution).toBeTruthy();
  });

  it("does not crash when the OpenAI fallback throws (e.g. 429 quota)", async () => {
    const { deps: d } = deps({
      labels: [{ label: "Tomato___Late_blight", score: 0.97 }],
      context: { crop: "rice_boro", locationText: "Bogura" },
    });
    d.vision = {
      configured: true,
      diagnose: vi.fn(async () => {
        throw new Error("OpenAI vision failed: HTTP 429 insufficient_quota");
      }),
    };
    const service = new LeafDiagnosisService(d);
    const result = await service.diagnose({ image: image(), locationText: "Bogura", save: false, createAlerts: false });

    // HF said tomato but the farm grows rice → no trustworthy answer, but no crash.
    expect(result.source).toBe("unavailable");
    expect(result.caution).toBeTruthy();
    expect(result.trace.some((e) => e.toolName === "leaf.openai.diagnose" && e.status === "error")).toBe(true);
  });

  it("rejects an unsupported file type before calling any model", async () => {
    const { deps: d } = deps({});
    const service = new LeafDiagnosisService(d);
    const bad: UploadedImage = { originalname: "x.gif", mimetype: "image/gif", size: 10, buffer: Buffer.from([1, 2, 3]) };
    await expect(service.diagnose({ image: bad, save: false })).rejects.toThrow(/unsupported image type/);
  });
});
