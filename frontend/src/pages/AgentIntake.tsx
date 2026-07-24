import { FormEvent, useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import FarmWeatherMap from "../components/common/FarmWeatherMap.js";
import { runAgentIntake, type AgentIntakeResult } from "../api/agent.js";
import type { IntakeProfile } from "../api/agrisense.js";
import { useAuth } from "../context/AuthContext.js";
import { ArrowUpIcon, ListIcon, SearchIcon } from "../icons/index.js";

type Language = "en" | "bn" | "banglish";

interface IntakeHistoryItem {
  savedAt: string;
  result: AgentIntakeResult;
}

interface LatestPlanContext {
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  farmProfile?: IntakeProfile;
}

const HISTORY_KEY = "agrisense.intakeHistory";
const LATEST_PLAN_KEY = "agrisense.latestPlan";

const starterMessages = [
  "I have 2 acres in Gazipur, sandy loam soil, rainfed, budget 45000, Aman season",
  "আমার গাজীপুরে ২ একর জমি আছে, দোআঁশ মাটি, বৃষ্টির পানি, বাজেট ৪৫০০০, আমন মৌসুম",
  "Dhaka te 1.5 acre jomi, bele mati, river water, budget 40000, monsoon",
];

export default function AgentIntake() {
  const { user } = useAuth();
  const latestContext = useMemo(readLatestPlanContext, []);
  const [message, setMessage] = useState(() => buildMessageFromProfile(latestContext.farmProfile) ?? starterMessages[0]);
  const [sessionId, setSessionId] = useState(latestContext.sessionId ?? "");
  const [farmerId, setFarmerId] = useState(latestContext.farmerId ?? latestContext.farmProfile?.farmerId ?? "");
  const [farmId, setFarmId] = useState(latestContext.farmId ?? latestContext.farmProfile?.farmId ?? "");
  const [language, setLanguage] = useState<Language>(latestContext.farmProfile?.preferredLanguage ?? "en");
  const [result, setResult] = useState<AgentIntakeResult | null>(null);
  const [history, setHistory] = useState<IntakeHistoryItem[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setHistory(readHistory());
  }, []);

  const activeProfile = result?.profile ?? latestContext.farmProfile;
  const activeMissingFields = result?.missingFields ?? missingFieldsForProfile(activeProfile);
  const intakeComplete = result?.intakeComplete ?? activeMissingFields.length === 0;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await runAgentIntake({
        message,
        sessionId: sessionId || undefined,
        farmerId: farmerId || undefined,
        farmId: farmId || undefined,
        userId: user?.id,
        preferredLanguage: language,
      });
      setResult(response);
      setSessionId(response.sessionId);
      setFarmerId(response.farmerId);
      setFarmId(response.farmId);
      saveHistory(response);
      setHistory(readHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intake failed");
    } finally {
      setLoading(false);
    }
  }

  function useResult(item: IntakeHistoryItem) {
    setResult(item.result);
    setSessionId(item.result.sessionId);
    setFarmerId(item.result.farmerId);
    setFarmId(item.result.farmId);
    setLanguage(item.result.profile.preferredLanguage ?? language);
    setMessage(buildMessageFromProfile(item.result.profile) ?? message);
  }

  function useLatestProfile() {
    if (!latestContext.farmProfile) return;
    setSessionId(latestContext.sessionId ?? latestContext.farmProfile.sessionId ?? "");
    setFarmerId(latestContext.farmerId ?? latestContext.farmProfile.farmerId ?? "");
    setFarmId(latestContext.farmId ?? latestContext.farmProfile.farmId ?? "");
    setLanguage(latestContext.farmProfile.preferredLanguage ?? language);
    setMessage(buildMessageFromProfile(latestContext.farmProfile) ?? message);
  }

  return (
    <>
      <PageMeta title="Agent Intake · ICT Fest Admin" description="Reusable farm intake workspace" />
      <PageBreadcrumb pageTitle="Agent Intake" />

      {error && <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(340px,0.9fr)_minmax(0,1.1fr)]">
        <section className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <ListIcon />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Farm Intake</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Collect only the missing farm details, then continue planning.</p>
              </div>
            </div>

            {latestContext.farmProfile && (
              <button
                type="button"
                onClick={useLatestProfile}
                className="mb-4 flex w-full items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-left text-sm text-brand-700 hover:bg-brand-100 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
              >
                <span>
                  Use latest AgriSense profile
                  <span className="mt-0.5 block text-xs opacity-80">{profileSummary(latestContext.farmProfile)}</span>
                </span>
                <ArrowUpIcon width={17} height={17} />
              </button>
            )}

            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <span className={labelClass}>Language</span>
                <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className={inputClass}>
                  <option value="en">English</option>
                  <option value="banglish">Banglish</option>
                  <option value="bn">বাংলা</option>
                </select>
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <SmallField label="Session" value={sessionId} onChange={setSessionId} placeholder="Auto" />
                <SmallField label="Farmer" value={farmerId} onChange={setFarmerId} placeholder="Auto" />
                <SmallField label="Farm" value={farmId} onChange={setFarmId} placeholder="Auto" />
              </div>

              <label className="block">
                <span className={labelClass}>Farmer Message</span>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className={`${inputClass} h-auto py-3`} />
              </label>

              <div className="flex flex-wrap gap-2">
                {starterMessages.map((starter) => (
                  <button
                    key={starter}
                    type="button"
                    onClick={() => setMessage(starter)}
                    className="rounded-full bg-gray-100 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 dark:bg-white/[0.06] dark:text-gray-300 dark:hover:bg-white/[0.1]"
                  >
                    {starter.length > 42 ? `${starter.slice(0, 42)}...` : starter}
                  </button>
                ))}
              </div>

              <button disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
                <ArrowUpIcon width={18} height={18} />
                {loading ? "Running intake..." : sessionId ? "Continue intake" : "Start intake"}
              </button>
            </form>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Previous Intake Results</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No saved intake turns in this browser yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {history.map((item) => (
                  <button
                    key={`${item.result.sessionId}-${item.savedAt}`}
                    type="button"
                    onClick={() => useResult(item)}
                    className="w-full rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{profileSummary(item.result.profile)}</p>
                      <span className={item.result.intakeComplete ? successPillClass : warningPillClass}>
                        {item.result.intakeComplete ? "complete" : `${item.result.missingFields.length} missing`}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{new Date(item.savedAt).toLocaleString()} · {shortId(item.result.sessionId)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <ProfileCard profile={activeProfile} missingFields={activeMissingFields} intakeComplete={intakeComplete} />

          {result && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Agent Reply</h2>
              <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:bg-white/[0.04] dark:text-gray-200">{result.reply}</p>
              {result.nextStep && (
                <div className="mt-4 rounded-lg border border-success-200 bg-success-50 p-3 dark:border-success-500/20 dark:bg-success-500/10">
                  <p className="text-sm font-medium text-success-700 dark:text-success-300">Ready for weather and crop planning</p>
                  <p className="mt-1 text-xs text-success-700/80 dark:text-success-300/80">{result.nextStep.plannedTools.join(" -> ")}</p>
                </div>
              )}
            </div>
          )}

          {result?.trace.length ? (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <div className="mb-3 flex items-center gap-2">
                <SearchIcon width={17} height={17} />
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Agent Trace</h2>
              </div>
              <div className="space-y-2">
                {result.trace.map((event, index) => (
                  <details key={`${event.toolName}-${index}`} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
                    <summary className="cursor-pointer text-sm font-medium text-gray-800 dark:text-gray-100">
                      {event.status} · {event.toolName} · {event.latencyMs}ms
                    </summary>
                    <pre className="custom-scrollbar mt-3 max-h-56 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
                      {JSON.stringify({ parameters: event.parameters, rawResponse: event.rawResponse, error: event.errorMessage }, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <button type="button" onClick={() => setShowRaw((value) => !value)} className="text-base font-semibold text-gray-900 dark:text-white">
              {showRaw ? "Hide Raw Result" : "Show Raw Result"}
            </button>
            {showRaw && (
              <pre className="custom-scrollbar mt-3 max-h-[520px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                {result ? JSON.stringify(result, null, 2) : "No intake result yet."}
              </pre>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function ProfileCard({ profile, missingFields, intakeComplete }: { profile?: IntakeProfile; missingFields: string[]; intakeComplete: boolean }) {
  const fields = [
    ["Location", profile?.locationText],
    ["Farm size", profile?.sizeAcres ? `${profile.sizeAcres} acres` : undefined],
    ["Soil", profile?.soilType],
    ["Water", profile?.waterAvailability],
    ["Budget", profile?.budgetBdt ? formatMoney(profile.budgetBdt) : undefined],
    ["Season", profile?.targetSeason],
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Saved Farm Profile</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Pulled from the latest plan, selected intake result, or current turn.</p>
        </div>
        <span className={intakeComplete ? successPillClass : warningPillClass}>
          {intakeComplete ? "complete" : `${missingFields.length} missing`}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">{value ?? "Missing"}</p>
          </div>
        ))}
      </div>

      {missingFields.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {missingFields.map((field) => <span key={field} className={warningPillClass}>{field}</span>)}
        </div>
      )}

      {profile && (profile.latitude !== undefined || profile.longitude !== undefined) && (
        <div className="mt-4">
          <FarmWeatherMap title="Saved Farm Location" profile={profile} />
        </div>
      )}
    </div>
  );
}

function SmallField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

function readLatestPlanContext(): LatestPlanContext {
  try {
    const raw = localStorage.getItem(LATEST_PLAN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      sessionId?: string;
      farmerId?: string;
      farmId?: string;
      farmProfile?: IntakeProfile;
    };
    return {
      sessionId: parsed.sessionId ?? parsed.farmProfile?.sessionId,
      farmerId: parsed.farmerId ?? parsed.farmProfile?.farmerId,
      farmId: parsed.farmId ?? parsed.farmProfile?.farmId,
      farmProfile: parsed.farmProfile,
    };
  } catch {
    return {};
  }
}

function readHistory(): IntakeHistoryItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as IntakeHistoryItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(result: AgentIntakeResult): void {
  const next = [
    { savedAt: new Date().toISOString(), result },
    ...readHistory().filter((item) => item.result.sessionId !== result.sessionId),
  ].slice(0, 8);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
}

function buildMessageFromProfile(profile?: IntakeProfile): string | undefined {
  if (!profile) return undefined;
  const parts = [
    profile.locationText ? `location ${profile.locationText}` : undefined,
    profile.sizeAcres ? `${profile.sizeAcres} acres` : undefined,
    profile.soilType ? `${profile.soilType} soil` : undefined,
    profile.waterAvailability ? `${profile.waterAvailability} water` : undefined,
    profile.budgetBdt ? `budget ${profile.budgetBdt} BDT` : undefined,
    profile.targetSeason ? `${profile.targetSeason} season` : undefined,
    profile.currentCrop ? `crop preference ${profile.currentCrop}` : undefined,
  ].filter(Boolean);
  return parts.length ? `Use my saved farm details: ${parts.join(", ")}` : undefined;
}

function missingFieldsForProfile(profile?: IntakeProfile): string[] {
  if (!profile) return ["location", "farmSize", "soilType", "waterAvailability", "budget", "targetSeason"];
  return [
    !profile.locationText ? "location" : undefined,
    !profile.sizeAcres ? "farmSize" : undefined,
    !profile.soilType ? "soilType" : undefined,
    !profile.waterAvailability ? "waterAvailability" : undefined,
    !profile.budgetBdt ? "budget" : undefined,
    !profile.targetSeason ? "targetSeason" : undefined,
  ].filter(Boolean) as string[];
}

function profileSummary(profile?: IntakeProfile): string {
  if (!profile) return "No saved profile";
  return [
    profile.locationText,
    profile.sizeAcres ? `${profile.sizeAcres} acres` : undefined,
    profile.soilType,
    profile.waterAvailability,
    profile.budgetBdt ? formatMoney(profile.budgetBdt) : undefined,
    profile.targetSeason,
  ].filter(Boolean).join(" · ") || "Saved farm profile";
}

function shortId(id?: string): string {
  return id ? id.slice(0, 8) : "no id";
}

function formatMoney(value: number): string {
  return `BDT ${Math.round(value).toLocaleString()}`;
}

const inputClass = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100 h-11";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
const successPillClass = "rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-400";
const warningPillClass = "rounded-full bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-400";
