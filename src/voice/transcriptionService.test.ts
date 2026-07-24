import { describe, expect, it, vi } from "vitest";
import { InMemoryAgriSenseStore } from "../agrisense/agrisenseStore.js";
import { validateAudio, VoiceTranscriptionService, type UploadedAudio } from "./transcriptionService.js";

const audio: UploadedAudio = {
  originalname: "farm.webm",
  mimetype: "audio/webm",
  size: 12,
  buffer: Buffer.from("voice-sample"),
};

describe("VoiceTranscriptionService", () => {
  it("lets OpenAI auto-detect Bangla/Banglish speech and persists trace", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ text: "আমার গাজীপুরে দুই একর জমি আছে" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const store = new InMemoryAgriSenseStore();
    const service = new VoiceTranscriptionService("sk-test", "whisper-1", fetchMock as typeof fetch, store);

    const result = await service.transcribe({
      audio,
      language: "banglish",
      sessionId: "session-1",
      farmerId: "farmer-1",
      farmId: "farm-1",
    });

    expect(result.transcript).toBe("আমার গাজীপুরে দুই একর জমি আছে");
    expect(result.model).toBe("whisper-1");
    expect(result.trace[0]?.toolName).toBe("voice.transcribe");
    expect(store.traces.get("session-1")?.[0]?.toolName).toBe("voice.transcribe");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(init.headers).toMatchObject({ Authorization: "Bearer sk-test" });
    const form = init.body as FormData;
    expect(form.get("model")).toBe("whisper-1");
    expect(form.get("language")).toBeNull();
    expect(form.get("prompt")).toEqual(expect.stringContaining("Bangladesh farmer"));
    expect(form.get("file")).toBeInstanceOf(Blob);
  });

  it("passes English language hint when explicitly requested", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ text: "I have two acres in Gazipur" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const service = new VoiceTranscriptionService("sk-test", "whisper-1", fetchMock as typeof fetch, new InMemoryAgriSenseStore());

    await service.transcribe({ audio, language: "en" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const form = init.body as FormData;
    expect(form.get("language")).toBe("en");
  });

  it("rejects unsupported audio before calling OpenAI", () => {
    expect(() => validateAudio({ ...audio, mimetype: "text/plain" })).toThrow("unsupported audio type");
  });

  it("records an error trace for OpenAI failures", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad audio" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const store = new InMemoryAgriSenseStore();
    const service = new VoiceTranscriptionService("sk-test", "whisper-1", fetchMock as typeof fetch, store);

    await expect(service.transcribe({ audio, language: "bn", sessionId: "session-2" })).rejects.toThrow("bad audio");
    expect(store.traces.get("session-2")?.[0]).toMatchObject({
      toolName: "voice.transcribe",
      status: "error",
      errorMessage: "bad audio",
    });
  });
});
