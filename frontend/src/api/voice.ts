import { apiFetch } from "./client.js";
import type { TraceEvent } from "./agrisense.js";

export interface VoiceTranscriptionResult {
  transcript: string;
  detectedLanguage: "en" | "bn" | "banglish";
  model: string;
  durationMs: number;
  trace: TraceEvent[];
}

export function transcribeVoice(input: {
  audio: Blob;
  filename?: string;
  language?: "en" | "bn" | "banglish";
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
}): Promise<VoiceTranscriptionResult> {
  const form = new FormData();
  form.set("audio", input.audio, input.filename ?? "agrisense-recording.webm");
  if (input.language) form.set("language", input.language);
  if (input.sessionId) form.set("sessionId", input.sessionId);
  if (input.farmerId) form.set("farmerId", input.farmerId);
  if (input.farmId) form.set("farmId", input.farmId);
  return apiFetch<VoiceTranscriptionResult>("/api/voice/transcribe", {
    method: "POST",
    body: form,
  });
}
