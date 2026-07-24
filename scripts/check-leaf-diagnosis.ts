/**
 * End-to-end smoke test for leaf diagnosis (HF classifier + OpenAI fallback +
 * Cloudinary hosting + KB grounding + trace). Runs the service directly with a
 * stubbed farm context so it needs no DB (save:false).
 *   npx tsx --env-file=.env scripts/check-leaf-diagnosis.ts <image> [crop] [location]
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { LeafDiagnosisService } from "../src/vision/leafDiagnosisService.js";

async function main(): Promise<void> {
  const [path, crop = "tomato", locationText = "Bogura"] = process.argv.slice(2);
  if (!path) {
    console.error("usage: tsx --env-file=.env scripts/check-leaf-diagnosis.ts <image> [crop] [location]");
    process.exit(1);
  }
  const buffer = readFileSync(path);
  const lower = path.toLowerCase();
  const mimetype = lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";

  const service = new LeafDiagnosisService({
    loadContext: async () => ({ crop, locationText, areaAcres: 2 }),
  });

  const result = await service.diagnose({
    image: { originalname: basename(path), mimetype, size: buffer.length, buffer },
    crop,
    locationText,
    save: false,
    createAlerts: false,
  });

  console.log("source      :", result.source);
  console.log("crop/disease:", result.crop, "→", result.disease, `(${Math.round(result.confidence * 100)}%)`);
  console.log("severity    :", result.severity, "| healthy:", result.healthy);
  console.log("imageUrl    :", result.imageUrl ?? "(none — Cloudinary skipped)");
  console.log("citation    :", result.citation ?? "(none)");
  console.log("caution     :", result.caution ?? "(none)");
  console.log("treatment   :", `[${result.treatment.source}]`, result.treatment.text.slice(0, 140));
  console.log("modelLabels :", result.modelLabels.slice(0, 3).map((l) => `${l.label} ${(l.score * 100).toFixed(1)}%`).join(" | ") || "(none)");
  console.log("decision    :", result.decisionReason);
  console.log("trace       :", result.trace.map((e) => `${e.toolName}:${e.status}`).join(" -> "));
}

void main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  });
