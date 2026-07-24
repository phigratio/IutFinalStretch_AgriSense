import { useEffect, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import {
  ensureTemporalSchedules,
  getTemporalWorkflowResult,
  listProactiveAlerts,
  listTemporalJobRuns,
  listTemporalSchedules,
  runTemporalWorkflow,
  type ProactiveAlert,
  type TemporalJobRun,
  type TemporalRunResult,
  type TemporalSchedule,
  type TemporalSchedulesResult,
} from "../api/temporal.js";
import { BellIcon, CalendarIcon, SearchIcon } from "../icons/index.js";

export default function Temporal() {
  const [schedules, setSchedules] = useState<TemporalSchedulesResult | null>(null);
  const [alerts, setAlerts] = useState<ProactiveAlert[]>([]);
  const [jobRuns, setJobRuns] = useState<TemporalJobRun[]>([]);
  const [lastRun, setLastRun] = useState<TemporalRunResult | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const featuredAlert = useMemo(() => alerts.find((alert) => alert.alertType === "heavy_rain") ?? alerts[0], [alerts]);
  const weatherSchedule = schedules?.schedules.find((schedule) => schedule.workflowType === "weatherAlertSweepWorkflow");

  async function refresh() {
    setLoading("refresh");
    setError(null);
    try {
      const [scheduleResult, nextAlerts, nextJobRuns] = await Promise.all([
        listTemporalSchedules().then((value) => ({ value })).catch((err: unknown) => ({ err })),
        listProactiveAlerts(20),
        listTemporalJobRuns(10),
      ]);
      if ("value" in scheduleResult) {
        setSchedules(scheduleResult.value);
      } else {
        setSchedules({
          taskQueue: "agrisense-cron",
          schedules: fallbackSchedules,
        });
        setError(scheduleResult.err instanceof Error ? `Schedule status unavailable: ${scheduleResult.err.message}` : "Schedule status unavailable");
      }
      setAlerts(nextAlerts);
      setJobRuns(nextJobRuns);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load proactive cron data");
    } finally {
      setLoading(null);
    }
  }

  async function ensure() {
    setLoading("ensure");
    setError(null);
    try {
      await ensureTemporalSchedules();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ensure schedules");
      setLoading(null);
    }
  }

  async function run(workflowType: string) {
    setLoading(workflowType);
    setError(null);
    setResult(null);
    try {
      const started = await runTemporalWorkflow(workflowType);
      setLastRun(started);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start workflow");
    } finally {
      setLoading(null);
    }
  }

  async function fetchResult() {
    if (!lastRun) return;
    setLoading("result");
    setError(null);
    try {
      const workflowResult = await getTemporalWorkflowResult(lastRun.workflowId);
      setResult(workflowResult);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Workflow is still running or failed");
    } finally {
      setLoading(null);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <>
      <PageMeta title="Proactive Cron Advice · ICT Fest Admin" description="Weather-triggered AgriSense plan adjustment console" />
      <PageBreadcrumb pageTitle="Proactive Cron Advice" />

      {error && <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>}

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-warning-50 text-warning-600 dark:bg-warning-500/15">
                <BellIcon />
              </span>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Weather-Triggered Plan Adjustments</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Temporal watches active farm plans, checks the forecast, and writes proactive advice back to the database.
                </p>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-600 dark:text-gray-300">
              Example user story: heavy rain appears inside the lookahead window, so the agent delays nitrogen or fertilizer work to reduce runoff and leaching loss while keeping the rest of the season plan intact.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={refresh} disabled={loading === "refresh"} className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
              Refresh
            </button>
            <button onClick={ensure} disabled={loading === "ensure"} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              Ensure crons
            </button>
            <button onClick={() => void run("weatherAlertSweepWorkflow")} disabled={loading === "weatherAlertSweepWorkflow"} className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
              Run weather sweep
            </button>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)]">
        <main className="space-y-4">
          <ProactiveStory alert={featuredAlert} schedule={weatherSchedule} />
          <ScheduleCards schedules={schedules?.schedules ?? []} loading={loading} onRun={run} />
          <AlertFeed alerts={alerts} />
        </main>

        <aside className="space-y-4">
          <JobRunPanel jobRuns={jobRuns} />
          <ManualRunPanel lastRun={lastRun} result={result} loading={loading} onFetchResult={fetchResult} />
        </aside>
      </div>
    </>
  );
}

const fallbackSchedules: TemporalSchedule[] = [
  {
    scheduleId: "agrisense-weather-alerts-daily-0700",
    workflowType: "weatherAlertSweepWorkflow",
    description: "Daily proactive weather-triggered advice for active farm plans.",
    cronExpression: "0 1 * * *",
    exists: false,
  },
  {
    scheduleId: "agrisense-plan-reminders-daily-0630",
    workflowType: "planTaskReminderSweepWorkflow",
    description: "Daily reminders for fertilizer, irrigation, pest, and harvest tasks due soon.",
    cronExpression: "30 0 * * *",
    exists: false,
  },
  {
    scheduleId: "agrisense-memory-refresh-every-6h",
    workflowType: "memoryRefreshSweepWorkflow",
    description: "Refresh semantic farm memory for returning-farmer demos.",
    cronExpression: "0 */6 * * *",
    exists: false,
  },
];

function ProactiveStory({ alert, schedule }: { alert?: ProactiveAlert; schedule?: TemporalSchedule }) {
  const adjustment = alert?.rawEvidence?.adjustment;
  const forecast = alert?.rawEvidence?.forecastDay;
  const impactedTask = alert?.rawEvidence?.impactedTask;
  const rainInDays = alert?.triggerDate ? daysFromToday(alert.triggerDate) : 4;
  const delayDays = adjustment?.delayDays ?? Math.max(rainInDays, 1);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-warning-600 dark:text-warning-400">
            <CalendarIcon width={16} height={16} />
            {schedule?.cronExpression ? `Cron ${schedule.cronExpression}` : "Daily forecast sweep"}
          </div>
          <h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">
            {forecast ? `Heavy rain in ${rainInDays} day${rainInDays === 1 ? "" : "s"}` : "No weather alert created yet"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
            {alert
              ? alert.message
              : "Run the weather sweep after a season plan exists. The cron will scan active farms, fetch forecast data, and create a proactive alert when rainfall crosses the configured threshold."}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="Rainfall trigger" value={forecast ? `${forecast.rainfallMm} mm` : "20 mm"} />
            <Metric label="Location" value={alert?.locationText ?? alert?.rawEvidence?.location ?? "Active farms"} />
            <Metric label="Impacted task" value={impactedTask?.title ?? "Nitrogen / fertilizer"} />
            <Metric label="Delay advice" value={`${delayDays} day${delayDays === 1 ? "" : "s"}`} />
          </div>
        </div>
        <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 dark:border-warning-500/20 dark:bg-warning-500/10">
          <p className="text-xs font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-300">Agent advice</p>
          <p className="mt-3 text-lg font-semibold leading-7 text-gray-900 dark:text-white">
            {alert?.recommendation ?? "Heavy rain in 4 days. Delay the nitrogen application by 4 days to cut runoff loss."}
          </p>
          <div className="mt-4 grid gap-2 text-sm text-gray-700 dark:text-gray-200">
            <StoryStep label="1. Watch" value="Temporal starts the weather sweep on schedule." />
            <StoryStep label="2. Detect" value="The activity checks forecast rainfall for each active farm." />
            <StoryStep label="3. Adjust" value="It links the risk to fertilizer work in the current season plan." />
            <StoryStep label="4. Persist" value="The recommendation is stored in proactive_alerts for web, SMS, or agent follow-up." />
          </div>
        </div>
      </div>
    </section>
  );
}

function ScheduleCards({ schedules, loading, onRun }: { schedules: TemporalSchedule[]; loading: string | null; onRun: (workflowType: string) => void }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Cron Jobs</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Schedules that keep farm advice current without a user prompt.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {schedules.map((schedule) => (
          <article key={schedule.scheduleId} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{friendlyWorkflowName(schedule.workflowType)}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{scheduleNote(schedule)}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${schedule.exists ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"}`}>
                {schedule.exists ? "active" : "missing"}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{schedule.cronExpression}</span>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{schedule.scheduleId}</span>
            </div>
            <button onClick={() => void onRun(schedule.workflowType)} disabled={loading === schedule.workflowType} className="mt-4 h-9 w-full rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
              Run now
            </button>
          </article>
        ))}
        {schedules.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">Loading schedules...</p>}
      </div>
    </section>
  );
}

function AlertFeed({ alerts }: { alerts: ProactiveAlert[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Proactive Advice Feed</h2>
      <div className="mt-4 space-y-3">
        {alerts.map((alert) => (
          <article key={alert.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${alert.severity === "warning" ? "bg-warning-50 text-warning-700 dark:bg-warning-500/15 dark:text-warning-300" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"}`}>
                    {alert.severity}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{alert.status}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{alert.recommendation}</p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {alert.locationText ?? "Unknown farm"} · {alert.planCrop ?? alert.currentCrop ?? "crop pending"} · {alert.ruleId}
                </p>
              </div>
              <div className="text-right text-xs text-gray-500 dark:text-gray-400">
                <p>{formatDate(alert.createdAt)}</p>
                <p className="mt-1">Trigger {alert.triggerDate ? formatDate(alert.triggerDate) : "n/a"}</p>
              </div>
            </div>
          </article>
        ))}
        {alerts.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No proactive alerts yet. Run the weather sweep after creating an AgriSense season plan.</p>}
      </div>
    </section>
  );
}

function JobRunPanel({ jobRuns }: { jobRuns: TemporalJobRun[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Recent Job Runs</h2>
      <div className="mt-4 space-y-3">
        {jobRuns.map((run) => (
          <div key={run.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{friendlyWorkflowName(run.workflowType)}</p>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{run.status}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Metric label="Scanned" value={String(run.summary?.scanned ?? 0)} />
              <Metric label="Created" value={String(run.summary?.created ?? 0)} />
              <Metric label="Skipped" value={String(run.summary?.skipped ?? 0)} />
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(run.startedAt)}</p>
          </div>
        ))}
        {jobRuns.length === 0 && <p className="text-sm text-gray-500 dark:text-gray-400">No job runs recorded yet.</p>}
      </div>
    </section>
  );
}

function ManualRunPanel({ lastRun, result, loading, onFetchResult }: { lastRun: TemporalRunResult | null; result: unknown; loading: string | null; onFetchResult: () => void }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Manual Run Evidence</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Use this when demoing the cron without waiting for the schedule.</p>
      <button onClick={onFetchResult} disabled={!lastRun || loading === "result"} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        <SearchIcon width={18} height={18} />
        Fetch result
      </button>
      <pre className="custom-scrollbar mt-4 max-h-[360px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
        {result ? JSON.stringify(result, null, 2) : lastRun ? JSON.stringify(lastRun, null, 2) : "No manual run yet."}
      </pre>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-white/[0.04]">
      <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function StoryStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/70 px-3 py-2 dark:bg-white/[0.05]">
      <p className="text-xs font-semibold text-gray-900 dark:text-white">{label}</p>
      <p className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-300">{value}</p>
    </div>
  );
}

function friendlyWorkflowName(workflowType: string): string {
  if (workflowType === "weatherAlertSweepWorkflow" || workflowType === "weather_alert_sweep") return "Weather advice sweep";
  if (workflowType === "planTaskReminderSweepWorkflow" || workflowType === "plan_task_reminder_sweep") return "Plan task reminders";
  if (workflowType === "memoryRefreshSweepWorkflow" || workflowType === "memory_refresh_sweep") return "Memory refresh";
  return workflowType;
}

function scheduleNote(schedule: TemporalSchedule): string {
  const stateNote = readNestedString(schedule.description, ["state", "note"]);
  if (stateNote) return stateNote;
  if (typeof schedule.description === "string") return schedule.description;
  return "Temporal schedule is registered and ready.";
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current : null;
}

function daysFromToday(date: string): number {
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const target = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(Math.round((target - today) / 86_400_000), 0);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
