import { useEffect, useRef, useState } from "react";
import { diagnoseLeaf, type LeafDiagnosisResult } from "../../api/vision.js";
import LeafResult from "./LeafResult.js";

/**
 * Leaf photo disease diagnosis (Tier-2 T2-4). Uploads a leaf photo to
 * POST /api/vision/diagnose (HuggingFace classifier primary, OpenAI vision
 * fallback with a caution). Reuses the farm's crop/location so the result is
 * grounded in the farmer's own data. Rendered inside the Pest & Disease page.
 */
export default function LeafDiagnosisCard(props: {
  farmId?: string;
  planId?: string;
  cropId?: string;
  cropLabel?: string;
  locationText?: string;
  areaAcres?: number;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<LeafDiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function run() {
    if (!file) {
      setError("Choose a leaf photo first.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const diagnosis = await diagnoseLeaf({
        file,
        farmId: props.farmId,
        planId: props.planId,
        crop: props.cropId,
        locationText: props.locationText,
        areaAcres: props.areaAcres,
        save: true,
        createAlerts: true,
      });
      setResult(diagnosis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Diagnosis failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Leaf Photo Diagnosis</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Upload a leaf photo — a trained model identifies the disease, with an AI vision fallback for crops it doesn't cover (e.g. rice).
          </p>
        </div>
        {(props.cropLabel || props.locationText) && (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            Using {props.cropLabel ?? props.cropId ?? "your crop"}{props.locationText ? ` · ${props.locationText}` : ""}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-start">
        <div className="md:w-52 md:shrink-0">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-40 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 hover:border-brand-400 dark:border-gray-700 dark:bg-white/[0.03] dark:text-gray-400"
          >
            {preview ? (
              <img src={preview} alt="Selected leaf" className="h-full w-full object-cover" />
            ) : (
              <span>Click to choose a leaf photo</span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => {
              setResult(null);
              setError(null);
              setFile(event.target.files?.[0] ?? null);
            }}
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={loading || !file}
            className="mt-3 h-10 w-full rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {loading ? "Diagnosing..." : "Diagnose Leaf"}
          </button>
          {error && <p className="mt-2 text-xs text-error-600 dark:text-error-500">{error}</p>}
        </div>

        <div className="flex-1">
          {!result ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The diagnosis, treatment, confidence, and the model trace appear here.
            </p>
          ) : (
            <LeafResult result={result} />
          )}
        </div>
      </div>
    </section>
  );
}
