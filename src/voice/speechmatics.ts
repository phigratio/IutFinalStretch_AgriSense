/**
 * Speechmatics batch speech-to-text (Bengali). Create a job with the audio + transcription
 * config, poll until done, then fetch the plain-text transcript. Docs:
 * https://docs.speechmatics.com/ — POST /v2/jobs (multipart data_file + config),
 * GET /v2/jobs/{id} (status), GET /v2/jobs/{id}/transcript?format=txt.
 */

import { config } from "../config.js";

export class SpeechmaticsNotConfiguredError extends Error {
  constructor() {
    super("Speechmatics is not configured (set SPEECHMATIC_API_KEY)");
    this.name = "SpeechmaticsNotConfiguredError";
  }
}

export function speechmaticsConfigured(): boolean {
  return Boolean(config.speechmaticApiKey);
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface SpeechmaticsOptions {
  language?: string; // ISO code, default "bn" (Bengali)
  operatingPoint?: "standard" | "enhanced";
  /** Overall timeout in ms for the poll loop. */
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Transcribe an audio buffer with Speechmatics batch API; returns the transcript text. */
export async function transcribeSpeechmatics(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  opts: SpeechmaticsOptions = {},
): Promise<string> {
  if (!speechmaticsConfigured()) throw new SpeechmaticsNotConfiguredError();
  const fetchFn = opts.fetchFn ?? fetch;
  const key = config.speechmaticApiKey as string;
  const base = config.speechmaticUrl.replace(/\/$/, "");
  const auth = { Authorization: `Bearer ${key}` };

  // 1) Create the job.
  const form = new FormData();
  form.append("data_file", new Blob([buffer], { type: mimetype || "audio/webm" }), filename);
  form.append(
    "config",
    JSON.stringify({
      type: "transcription",
      transcription_config: {
        language: opts.language ?? "bn",
        operating_point: opts.operatingPoint ?? "enhanced",
      },
    }),
  );
  const createRes = await fetchFn(`${base}/jobs`, { method: "POST", headers: auth, body: form });
  if (!createRes.ok) {
    throw new Error(`Speechmatics job create failed (${createRes.status}): ${await safeText(createRes)}`);
  }
  const created = (await createRes.json()) as { id?: string };
  const jobId = created.id;
  if (!jobId) throw new Error("Speechmatics did not return a job id");

  // 2) Poll until done.
  const deadline = Date.now() + (opts.timeoutMs ?? 90_000);
  for (;;) {
    if (Date.now() > deadline) throw new Error("Speechmatics transcription timed out");
    await sleep(1500);
    const jobRes = await fetchFn(`${base}/jobs/${jobId}`, { headers: auth });
    if (!jobRes.ok) continue;
    const body = (await jobRes.json()) as { job?: { status?: string; errors?: unknown } };
    const status = body.job?.status;
    if (status === "done") break;
    if (status === "rejected") {
      throw new Error(`Speechmatics rejected the audio: ${JSON.stringify(body.job?.errors ?? {})}`);
    }
  }

  // 3) Fetch the plain-text transcript.
  const txtRes = await fetchFn(`${base}/jobs/${jobId}/transcript?format=txt`, { headers: auth });
  if (!txtRes.ok) {
    throw new Error(`Speechmatics transcript fetch failed (${txtRes.status}): ${await safeText(txtRes)}`);
  }
  return (await txtRes.text()).trim();
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 300);
  } catch {
    return "";
  }
}
