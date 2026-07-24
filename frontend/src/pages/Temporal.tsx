import { useEffect, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import {
  ensureTemporalSchedules,
  getTemporalWorkflowResult,
  listTemporalSchedules,
  runTemporalWorkflow,
  type TemporalRunResult,
  type TemporalSchedulesResult,
} from "../api/temporal.js";
import { CalendarIcon, SearchIcon } from "../icons/index.js";

export default function Temporal() {
  const [schedules, setSchedules] = useState<TemporalSchedulesResult | null>(null);
  const [lastRun, setLastRun] = useState<TemporalRunResult | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading("refresh");
    setError(null);
    try {
      setSchedules(await listTemporalSchedules());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Temporal schedules");
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
      setResult(await getTemporalWorkflowResult(lastRun.workflowId));
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
      <PageMeta title="Temporal · ICT Fest Admin" description="AgriSense scheduled workflow console" />
      <PageBreadcrumb pageTitle="Temporal" />

      {error && <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
                <CalendarIcon />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Scheduled Workflows</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">Task queue: {schedules?.taskQueue ?? "loading"}</p>
              </div>
            </div>
            <button onClick={ensure} disabled={loading === "ensure"} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              Ensure
            </button>
          </div>

          <div className="space-y-3">
            {(schedules?.schedules ?? []).map((schedule) => (
              <article key={schedule.scheduleId} className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-white">{schedule.workflowType}</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{schedule.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{schedule.scheduleId}</span>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">cron {schedule.cronExpression}</span>
                      <span className="rounded-full bg-success-50 px-2.5 py-1 text-success-700 dark:bg-success-500/15 dark:text-success-400">{schedule.exists ? "exists" : "missing"}</span>
                    </div>
                  </div>
                  <button onClick={() => void run(schedule.workflowType)} disabled={loading === schedule.workflowType} className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
                    Run now
                  </button>
                </div>
              </article>
            ))}
            {!schedules && <p className="text-sm text-gray-500 dark:text-gray-400">Loading schedules...</p>}
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Last Manual Run</h2>
            <pre className="custom-scrollbar max-h-[220px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
              {lastRun ? JSON.stringify(lastRun, null, 2) : "No manual run yet."}
            </pre>
            <button onClick={fetchResult} disabled={!lastRun || loading === "result"} className="mt-3 inline-flex h-10 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              <SearchIcon width={18} height={18} />
              Fetch result
            </button>
          </section>
          <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Workflow Result</h2>
            <pre className="custom-scrollbar max-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
              {result ? JSON.stringify(result, null, 2) : "Run a workflow, then fetch its result."}
            </pre>
          </section>
        </aside>
      </div>
    </>
  );
}
