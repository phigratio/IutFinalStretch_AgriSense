import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createVoiceRouter } from "./voice.js";
import { VoiceTranscriptionService } from "../voice/transcriptionService.js";

function makeApp(fetchMock = vi.fn(async () =>
  new Response(JSON.stringify({ text: "amar dui acre jomi ase" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }),
)) {
  const app = express();
  app.use("/api/voice", createVoiceRouter(new VoiceTranscriptionService("sk-test", "whisper-1", fetchMock as typeof fetch)));
  return { app, fetchMock };
}

describe("/api/voice", () => {
  it("transcribes an uploaded audio file", async () => {
    const { app } = makeApp();

    const res = await request(app)
      .post("/api/voice/transcribe")
      .field("language", "banglish")
      .field("sessionId", "session-1")
      .attach("audio", Buffer.from("voice"), {
        filename: "voice.webm",
        contentType: "audio/webm",
      });

    expect(res.status).toBe(200);
    expect(res.body.transcript).toBe("amar dui acre jomi ase");
    expect(res.body.trace[0].toolName).toBe("voice.transcribe");
  });

  it("400s when audio is missing", async () => {
    const { app, fetchMock } = makeApp();

    const res = await request(app)
      .post("/api/voice/transcribe")
      .field("language", "bn");

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("audio file is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400s unsupported files before OpenAI is called", async () => {
    const { app, fetchMock } = makeApp();

    const res = await request(app)
      .post("/api/voice/transcribe")
      .attach("audio", Buffer.from("not audio"), {
        filename: "note.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("unsupported audio type");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
