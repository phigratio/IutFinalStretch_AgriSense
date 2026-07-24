import type { LeafDiagnosisResult, LeafSource } from "../../api/vision.js";

/**
 * Renders one leaf-diagnosis result: source badge (Trained model / AI vision —
 * caution / Unavailable), confidence, caution banner, KB/AI treatment + cost,
 * differentials, raw model scores, and the agent trace. Shared by the Pest &
 * Disease page card and the AgriSense chat flow so both look identical.
 */
export default function LeafResult({ result }: { result: LeafDiagnosisResult }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {result.healthy ? "No disease detected" : result.disease}
        </h3>
        <SourceBadge source={result.source} />
        {!result.healthy && <SeverityBadge severity={result.severity} />}
        {result.cropId || result.crop ? (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] capitalize text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
            {result.crop}
          </span>
        ) : null}
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
          <span>Confidence</span>
          <span>{Math.round(result.confidence * 100)}%</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-gray-100 dark:bg-white/[0.08]">
          <div className="h-2 rounded-full bg-brand-500" style={{ width: `${Math.round(result.confidence * 100)}%` }} />
        </div>
      </div>

      {result.caution && (
        <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-700 dark:border-warning-500/20 dark:bg-warning-500/10 dark:text-warning-300">
          {result.caution}
        </p>
      )}

      {result.symptoms && <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">{result.symptoms}</p>}

      {!result.healthy && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ActionBox title="Treat" treatment={result.treatment} />
          <ActionBox title="Prevent" treatment={result.prevention} />
        </div>
      )}

      {result.differentials.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Also consider:</span>
          {result.differentials.map((item) => (
            <span key={item} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {item}
            </span>
          ))}
        </div>
      )}

      {result.citation && <p className="text-xs text-gray-500 dark:text-gray-400">{result.citation}</p>}
      <p className="text-[11px] text-gray-400">Why this path: {result.decisionReason}</p>

      {result.modelLabels.length > 0 && (
        <details className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
          <summary className="cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-100">
            Raw model scores ({result.modelLabels.length})
          </summary>
          <div className="mt-2 space-y-1">
            {result.modelLabels.map((label) => (
              <div key={label.label} className="flex items-center justify-between text-[11px] text-gray-600 dark:text-gray-300">
                <span className="truncate pr-2">{label.label}</span>
                <span>{(label.score * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {result.trace.length > 0 && (
        <details className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
          <summary className="cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-100">
            Agent trace ({result.trace.length} steps)
          </summary>
          <div className="mt-2 space-y-2">
            {result.trace.map((event, index) => (
              <details key={`${event.toolName}-${index}`} className="rounded-lg bg-white p-2 dark:bg-white/[0.04]">
                <summary className="cursor-pointer text-[11px] font-semibold text-gray-700 dark:text-gray-200">
                  {event.toolName} · {event.status}
                </summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words text-[11px] text-gray-600 dark:text-gray-300">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ActionBox({ title, treatment }: { title: string; treatment: LeafDiagnosisResult["treatment"] }) {
  const sourceLabel = treatment.source === "kb" ? "KB" : treatment.source === "ai" ? "AI" : "general";
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">{sourceLabel}</span>
          {typeof treatment.estimatedCostBdt === "number" && (
            <span className="shrink-0 text-sm font-semibold text-gray-900 dark:text-white">
              ৳{new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(treatment.estimatedCostBdt)}
            </span>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{treatment.text}</p>
    </div>
  );
}

function SourceBadge({ source }: { source: LeafSource }) {
  const map: Record<LeafSource, { label: string; cls: string }> = {
    hf: { label: "Trained model", cls: "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" },
    openai: { label: "AI vision", cls: "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" },
    unavailable: { label: "Unavailable", cls: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300" },
  };
  const item = map[source];
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.cls}`}>{item.label}</span>;
}

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === "high"
    ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"
    : severity === "medium"
      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
      : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{severity}</span>;
}
