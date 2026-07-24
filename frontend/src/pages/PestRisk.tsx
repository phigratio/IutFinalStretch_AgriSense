import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import FarmWeatherMap from "../components/common/FarmWeatherMap.js";
import {
  assessPestRisk,
  getPestAssessment,
  listPestAssessments,
  type PestAssessmentRecord,
  type PestRisk,
  type PestRiskResult,
  type PestSeverity,
} from "../api/pestRisk.js";
import { BoxIcon, CalendarIcon, SearchIcon } from "../icons/index.js";

const cropOptions = [
  { id: "rice_t_aman", label: "Aman rice" },
  { id: "rice_boro", label: "Boro rice" },
  { id: "potato", label: "Potato" },
  { id: "tomato", label: "Tomato" },
];

const stageOptions = ["seedling", "tillering", "vegetative", "flowering", "fruiting", "bulking", "grain_fill"];

export default function PestRiskPage() {
  const [params] = useSearchParams();
  const [cropId, setCropId] = useState(params.get("cropId") ?? "rice_t_aman");
  const [growthStage, setGrowthStage] = useState(params.get("growthStage") ?? "tillering");
  const [daysAfterSowing, setDaysAfterSowing] = useState(params.get("daysAfterSowing") ?? "35");
  const [areaAcres, setAreaAcres] = useState(params.get("areaAcres") ?? "2");
  const [locationText, setLocationText] = useState(params.get("locationText") ?? "Gazipur");
  const [geoPoint, setGeoPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [result, setResult] = useState<PestRiskResult | null>(null);
  const [history, setHistory] = useState<PestAssessmentRecord[]>([]);
  const [selectedAssessment, setSelectedAssessment] = useState<PestAssessmentRecord | null>(null);
  const [selectedRiskId, setSelectedRiskId] = useState<string | null>(null);
  const [loadingAssessmentId, setLoadingAssessmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planId = params.get("planId") ?? undefined;
  const farmId = params.get("farmId") ?? undefined;
  const sortedRisks = useMemo(() => result?.assessment.risks ?? [], [result]);

  useEffect(() => {
    void refreshHistory();
  }, [farmId, planId]);

  async function refreshHistory() {
    try {
      setHistory(await listPestAssessments({ farmId, planId, limit: 12 }));
    } catch {
      setHistory([]);
    }
  }

  async function openSavedRisk(assessmentId: string, riskId?: string) {
    setError(null);
    setLoadingAssessmentId(assessmentId);
    try {
      const assessment = await getPestAssessment(assessmentId);
      setSelectedAssessment(assessment);
      setSelectedRiskId(riskId ?? assessment.risks[0]?.ruleId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved pest risk");
    } finally {
      setLoadingAssessmentId(null);
    }
  }

  async function runAssessment(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await assessPestRisk({
        cropId,
        growthStage,
        daysAfterSowing: numeric(daysAfterSowing),
        areaAcres: numeric(areaAcres),
        locationText,
        latitude: geoPoint?.latitude,
        longitude: geoPoint?.longitude,
        farmId,
        planId,
        save: true,
        createAlerts: true,
      });
      setResult(response);
      await refreshHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assess pest risk");
    } finally {
      setLoading(false);
    }
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setError("Device geolocation is not available in this browser.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoPoint({
          latitude: roundCoord(position.coords.latitude),
          longitude: roundCoord(position.coords.longitude),
        });
        setLocationText((current) => current.trim() || "Device location");
      },
      (err) => setError(err.message || "Could not read device location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <>
      <PageMeta title="Pest Risk · AgriSense" description="Weather-grounded pest and disease risk for Bangladesh farms" />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Pest & Disease Risk</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Predict likely pest and disease pressure from crop, growth stage, and live weather.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAssessment()}
          disabled={loading}
          className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Checking..." : "Run Risk Check"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.55fr)_minmax(320px,0.8fr)]">
        <aside className="space-y-4">
          <form onSubmit={runAssessment} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <SearchIcon width={18} height={18} />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Assessment Inputs</h2>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="Crop">
                <select value={cropId} onChange={(event) => setCropId(event.target.value)} className={inputClass}>
                  {cropOptions.map((crop) => <option key={crop.id} value={crop.id}>{crop.label}</option>)}
                </select>
              </Field>
              <Field label="Growth stage">
                <select value={growthStage} onChange={(event) => setGrowthStage(event.target.value)} className={inputClass}>
                  {stageOptions.map((stage) => <option key={stage} value={stage}>{stage.replace("_", " ")}</option>)}
                </select>
              </Field>
              <Field label="Days after sowing">
                <input value={daysAfterSowing} onChange={(event) => setDaysAfterSowing(event.target.value)} className={inputClass} inputMode="numeric" />
              </Field>
              <Field label="Area acres">
                <input value={areaAcres} onChange={(event) => setAreaAcres(event.target.value)} className={inputClass} inputMode="decimal" />
              </Field>
              <Field label="Location">
                <input value={locationText} onChange={(event) => setLocationText(event.target.value)} className={inputClass} />
              </Field>
              <button
                type="button"
                onClick={useDeviceLocation}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
              >
                {geoPoint ? `GPS ${geoPoint.latitude.toFixed(3)}, ${geoPoint.longitude.toFixed(3)}` : "Use Device GPS"}
              </button>
            </div>
            <button type="submit" disabled={loading} className="mt-4 h-10 w-full rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
              {loading ? "Checking..." : "Assess"}
            </button>
            {(farmId || planId) && (
              <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
                Linked context: {farmId ? `farm ${shortId(farmId)}` : ""} {planId ? `plan ${shortId(planId)}` : ""}
              </p>
            )}
          </form>

          <HistoryPanel
            history={history}
            loadingAssessmentId={loadingAssessmentId}
            onOpenRisk={(assessmentId, riskId) => void openSavedRisk(assessmentId, riskId)}
          />
        </aside>

        <main className="space-y-4">
          <WeatherDrivers result={result} />
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BoxIcon width={18} height={18} />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ranked Risks</h2>
              </div>
              {result && <SeverityBadge severity={result.assessment.highestSeverity} />}
            </div>
            {sortedRisks.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Run a check to see crop-stage-specific pest and disease risks.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {sortedRisks.map((risk) => <RiskCard key={risk.ruleId} risk={risk} areaAcres={result?.assessment.areaAcres ?? 1} />)}
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4">
          <SafetyPanel result={result} />
          <TracePanel result={result} />
        </aside>
      </div>

      {selectedAssessment && (
        <SavedAssessmentModal
          assessment={selectedAssessment}
          selectedRiskId={selectedRiskId}
          onSelectRisk={setSelectedRiskId}
          onClose={() => {
            setSelectedAssessment(null);
            setSelectedRiskId(null);
          }}
        />
      )}
    </>
  );
}

function WeatherDrivers({ result }: { result: PestRiskResult | null }) {
  const features = result?.assessment.weatherFeatures;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <CalendarIcon width={18} height={18} />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Weather Drivers</h2>
      </div>
      {!features ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Weather signals appear after assessment.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Rain 3d" value={`${features.rain3dMm} mm`} />
          <Metric label="Rain 7d" value={`${features.rain7dMm} mm`} />
          <Metric label="Avg temp" value={`${features.avgTempC}C`} />
          <Metric label="Humidity" value={features.avgHumidityPct ? `${features.avgHumidityPct}%` : "n/a"} />
          <Metric label="Temp range" value={`${features.minTempC}-${features.maxTempC}C`} />
          <Metric label="Wetness proxy" value={features.wetnessProxy} />
          <Metric label="Alerts" value={result?.alertsCreated ?? 0} />
          <Metric label="Provider" value={result?.weather.provider ?? "n/a"} />
        </div>
      )}
      {result?.weather && (
        <div className="mt-4">
          <FarmWeatherMap
            title="Risk Location Map"
            weather={result.weather}
            cropLabel={result.assessment.cropLabel}
            riskLabel={`${result.assessment.highestSeverity} risk`}
          />
        </div>
      )}
    </section>
  );
}

function RiskCard({ risk, areaAcres }: { risk: PestRisk; areaAcres: number }) {
  return (
    <article className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{risk.issueName}</h3>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] capitalize text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{risk.issueType}</span>
            <SeverityBadge severity={risk.severity} />
          </div>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{risk.symptoms}</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">{risk.score}/100</span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ActionBox title="Prevent" text={risk.prevention.text} cost={risk.prevention.estimatedCostBdt} perAcre={risk.prevention.estimatedCostBdtPerAcre} areaAcres={areaAcres} />
        <ActionBox title="Treat" text={risk.treatment.text} cost={risk.treatment.estimatedCostBdt} perAcre={risk.treatment.estimatedCostBdtPerAcre} areaAcres={areaAcres} />
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        <ConditionList title="Matched" items={risk.matchedConditions} />
        <ConditionList title="Not matched" items={risk.unmatchedConditions} muted />
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{risk.citation}</p>
    </article>
  );
}

function ActionBox({ title, text, cost, perAcre, areaAcres }: { title: string; text: string; cost: number; perAcre: number; areaAcres: number }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
        <p className="shrink-0 text-sm font-semibold text-gray-900 dark:text-white">{formatMoney(cost)}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-600 dark:text-gray-300">{text}</p>
      <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{formatMoney(perAcre)}/acre x {areaAcres} acre</p>
    </div>
  );
}

function ConditionList({ title, items, muted = false }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-900 dark:text-white">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.length === 0 ? <span className="text-xs text-gray-400">None</span> : items.map((item) => (
          <span key={item} className={`rounded-full px-2 py-1 text-[11px] ${muted ? "bg-gray-100 text-gray-500 dark:bg-white/[0.04] dark:text-gray-400" : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400"}`}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function HistoryPanel({
  history,
  loadingAssessmentId,
  onOpenRisk,
}: {
  history: PestAssessmentRecord[];
  loadingAssessmentId: string | null;
  onOpenRisk: (assessmentId: string, riskId?: string) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Previous Pest Risks</h2>
      <div className="mt-3 space-y-2">
        {history.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No saved pest assessments yet.</p>
        ) : history.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">{item.cropLabel}</p>
              <SeverityBadge severity={item.highestSeverity} />
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {item.growthStage} · {item.locationText} · {formatDate(item.createdAt.slice(0, 10))}
            </p>
            <div className="mt-2 space-y-1.5">
              {item.risks.map((risk) => {
                const riskId = String(risk.ruleId ?? risk.issueName ?? "risk");
                return (
                <button
                  key={riskId}
                  type="button"
                  onClick={() => onOpenRisk(item.id, riskId)}
                  disabled={loadingAssessmentId === item.id}
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-gray-100 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-brand-200 hover:bg-brand-50 disabled:opacity-60 dark:border-white/[0.06] dark:text-gray-200 dark:hover:border-brand-500/30 dark:hover:bg-brand-500/10"
                >
                  <span className="min-w-0 truncate">{risk.issueName}</span>
                  <span className="shrink-0 font-semibold text-brand-500">
                    {loadingAssessmentId === item.id ? "Loading" : `${risk.score}/100`}
                  </span>
                </button>
              );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SavedAssessmentModal({
  assessment,
  selectedRiskId,
  onSelectRisk,
  onClose,
}: {
  assessment: PestAssessmentRecord;
  selectedRiskId: string | null;
  onSelectRisk: (riskId: string) => void;
  onClose: () => void;
}) {
  const selectedRisk = assessment.risks.find((risk) => risk.ruleId === selectedRiskId) ?? assessment.risks[0];

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-900/55 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-950">
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Saved Pest Risk Run</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {assessment.cropLabel} · {assessment.growthStage} · {assessment.locationText} · {formatDateTime(assessment.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.04]"
          >
            Close
          </button>
        </div>

        <div className="grid max-h-[calc(92vh-74px)] overflow-y-auto lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b border-gray-200 p-4 dark:border-gray-800 lg:border-b-0 lg:border-r">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Metric label="Highest risk" value={assessment.highestSeverity} />
              <Metric label="Area" value={`${assessment.areaAcres} acres`} />
              <Metric label="Days" value={assessment.daysAfterSowing ?? "n/a"} />
              <Metric label="Provider" value={assessment.weather.provider} />
            </div>
            <div className="mt-4 space-y-2">
              {assessment.risks.map((risk) => (
                <button
                  key={risk.ruleId}
                  type="button"
                  onClick={() => onSelectRisk(risk.ruleId)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    risk.ruleId === selectedRisk?.ruleId
                      ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300"
                      : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="block truncate font-semibold">{risk.issueName}</span>
                  <span className="mt-1 block text-xs opacity-80">{risk.score}/100 · {risk.severity}</span>
                </button>
              ))}
            </div>
          </aside>

          <main className="space-y-4 p-4">
            {selectedRisk ? (
              <RiskCard risk={selectedRisk} areaAcres={assessment.areaAcres} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">No saved risks in this run.</p>
            )}

            <section className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Saved Weather</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                {assessment.weather.daily.slice(0, 4).map((day) => (
                  <div key={day.date} className="rounded-lg bg-gray-50 p-3 text-xs dark:bg-white/[0.04]">
                    <p className="font-semibold text-gray-900 dark:text-white">{formatDate(day.date)}</p>
                    <p className="mt-1 text-gray-500 dark:text-gray-400">{day.rainfallMm} mm rain</p>
                    <p className="text-gray-500 dark:text-gray-400">{day.temperatureMinC}-{day.temperatureMaxC}C</p>
                  </div>
                ))}
              </div>
            </section>

            <TracePanel result={{ assessment: recordToAssessment(assessment), weather: assessment.weather, trace: assessment.trace, alertsCreated: 0, savedAssessmentId: assessment.id, context: {} }} />
          </main>
        </div>
      </div>
    </div>
  );
}

function SafetyPanel({ result }: { result: PestRiskResult | null }) {
  return (
    <section className="rounded-lg border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Safety & Scope</h2>
      <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
        {result?.assessment.safetyNote ?? "Follow local DAE/SAAO advice and product label dosage before pesticide or fungicide use."}
      </p>
      <p className="mt-3 text-xs leading-5 text-gray-600 dark:text-gray-300">
        v1 covers rice, potato, and tomato with weather-triggered rules. It predicts risk, not visual diagnosis.
      </p>
    </section>
  );
}

function TracePanel({ result }: { result: PestRiskResult | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Risk Trace</h2>
      <div className="mt-3 space-y-2">
        {!result ? <p className="text-sm text-gray-500 dark:text-gray-400">Trace appears after a run.</p> : result.trace.map((event, index) => (
          <details key={`${event.toolName}-${index}`} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
            <summary className="cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-100">{event.toolName} · {event.status}</summary>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">{JSON.stringify(event, null, 2)}</pre>
          </details>
        ))}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: PestSeverity | string }) {
  const cls = severity === "high"
    ? "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"
    : severity === "medium"
      ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300"
      : "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>{severity}</span>;
}

const inputClass = "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";

function numeric(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function recordToAssessment(record: PestAssessmentRecord) {
  return {
    id: record.id,
    cropId: record.cropId,
    cropLabel: record.cropLabel,
    growthStage: record.growthStage,
    daysAfterSowing: record.daysAfterSowing,
    areaAcres: record.areaAcres,
    weatherFeatures: {
      rain3dMm: sumRain(record.weather.daily.slice(0, 3)),
      rain7dMm: sumRain(record.weather.daily.slice(0, 7)),
      avgTempC: average(record.weather.daily.map((day) => (day.temperatureMinC + day.temperatureMaxC) / 2)),
      minTempC: Math.min(...record.weather.daily.map((day) => day.temperatureMinC)),
      maxTempC: Math.max(...record.weather.daily.map((day) => day.temperatureMaxC)),
      avgHumidityPct: average(record.weather.daily.map((day) => day.humidityPct ?? 0).filter((value) => value > 0)),
      wetnessProxy: sumRain(record.weather.daily.slice(0, 7)),
    },
    highestSeverity: record.highestSeverity,
    risks: record.risks,
    citations: record.risks.map((risk) => risk.citation),
    safetyNote: "Follow local DAE/SAAO advice and product label dosage before pesticide or fungicide use.",
  };
}

function sumRain(days: PestAssessmentRecord["weather"]["daily"]): number {
  return Math.round(days.reduce((sum, day) => sum + day.rainfallMm, 0) * 10) / 10;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function formatMoney(value: number): string {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-BD", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
