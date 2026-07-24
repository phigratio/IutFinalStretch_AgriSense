import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { detectInputLanguage, normalizeLanguage, type SupportedLanguage } from "../language/localization.js";
import { getDefaultAgriSenseStore, type AgriSenseStore } from "../agrisense/agrisenseStore.js";

export interface UploadedAudio {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface VoiceTranscriptionInput {
  audio: UploadedAudio;
  language?: string;
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
}

export interface VoiceTranscriptionResult {
  transcript: string;
  detectedLanguage: SupportedLanguage;
  model: string;
  durationMs: number;
  trace: IntakeTraceEvent[];
}

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/ogg",
  "video/webm",
]);

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

const BANGLADESH_AGRI_PROMPT = [
  "The speaker is a Bangladesh farmer describing a farm to AgriSense AI.",
  "Transcribe Bengali, Banglish, or English accurately.",
  "Agriculture terms may include Aman, Boro, Aus, dhan, alu, shorisha, vutta, bigha, decimal, acre, bele mati, doash mati, urea, TSP, MoP, sech, brishti, nodi, pukur, khal, Gazipur, Dhaka, Bogura, Rangpur, Dinajpur, Rajshahi.",
].join(" ");

type FetchLike = typeof fetch;

export class VoiceTranscriptionService {
  constructor(
    private readonly apiKey = config.openaiApiKey,
    private readonly model = config.openaiSttModel,
    private readonly fetchFn: FetchLike = fetch,
    private readonly store: Pick<AgriSenseStore, "saveTrace"> = getDefaultAgriSenseStore(),
  ) {}

  async transcribe(input: VoiceTranscriptionInput): Promise<VoiceTranscriptionResult> {
    validateAudio(input.audio);
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for voice transcription");
    }

    const startedAt = Date.now();
    const trace: IntakeTraceEvent[] = [];
    const normalizedLanguage = normalizeLanguage(input.language);

    try {
      const form = new FormData();
      form.set("model", this.model);
      form.set("prompt", BANGLADESH_AGRI_PROMPT);
      const openAiLanguage = languageForOpenAI(normalizedLanguage);
      if (openAiLanguage) form.set("language", openAiLanguage);
      form.set("file", new Blob([new Uint8Array(input.audio.buffer)], { type: input.audio.mimetype }), input.audio.originalname || "recording.webm");

      const response = await this.fetchFn("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
      const raw = await response.json().catch(() => ({})) as { text?: unknown; error?: { message?: string } };
      if (!response.ok) {
        throw new Error(raw.error?.message ?? `OpenAI transcription failed with ${response.status}`);
      }

      const transcript = typeof raw.text === "string" ? raw.text.trim() : "";
      if (!transcript) {
        throw new Error("OpenAI returned an empty transcription");
      }

      const event = traceEvent("voice.transcribe", {
        model: this.model,
        language: normalizedLanguage,
        openAiLanguage,
        mimeType: input.audio.mimetype,
        sizeBytes: input.audio.size,
        sessionId: input.sessionId,
        farmerId: input.farmerId,
        farmId: input.farmId,
      }, {
        transcript,
        model: this.model,
      }, Date.now() - startedAt);
      trace.push(event);
      await this.saveTraceIfPossible(input.sessionId, event);

      return {
        transcript,
        detectedLanguage: detectInputLanguage(transcript, normalizedLanguage),
        model: this.model,
        durationMs: Date.now() - startedAt,
        trace,
      };
    } catch (error) {
      const event = traceEvent("voice.transcribe", {
        model: this.model,
        language: normalizedLanguage,
        mimeType: input.audio.mimetype,
        sizeBytes: input.audio.size,
        sessionId: input.sessionId,
        farmerId: input.farmerId,
        farmId: input.farmId,
      }, { transcript: null }, Date.now() - startedAt, "error", (error as Error).message);
      trace.push(event);
      await this.saveTraceIfPossible(input.sessionId, event);
      throw error;
    }
  }

  private async saveTraceIfPossible(sessionId: string | undefined, event: IntakeTraceEvent): Promise<void> {
    if (!sessionId) return;
    try {
      await this.store.saveTrace(sessionId, event);
    } catch {
      // Voice input should not fail just because judge trace persistence is temporarily unavailable.
    }
  }
}

export function validateAudio(audio: UploadedAudio | undefined): asserts audio is UploadedAudio {
  if (!audio) {
    throw new Error("audio file is required");
  }
  if (!audio.buffer?.length || audio.size <= 0) {
    throw new Error("audio file is empty");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    throw new Error("audio file must be 10 MB or smaller");
  }
  if (!ALLOWED_AUDIO_MIME_TYPES.has(audio.mimetype)) {
    throw new Error(`unsupported audio type: ${audio.mimetype}`);
  }
}

function languageForOpenAI(language: SupportedLanguage | undefined): "bn" | "en" | undefined {
  if (language === "bn" || language === "banglish") return "bn";
  if (language === "en") return "en";
  return undefined;
}

function traceEvent(
  toolName: string,
  parameters: Record<string, unknown>,
  rawResponse: unknown,
  latencyMs: number,
  status: "success" | "error" = "success",
  errorMessage?: string,
): IntakeTraceEvent {
  return {
    traceId: randomUUID(),
    kind: status === "error" ? "error" : "tool",
    toolName,
    parameters,
    rawResponse,
    status,
    errorMessage,
    latencyMs,
  };
}

export const voiceTranscriptionService = new VoiceTranscriptionService();
