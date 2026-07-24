import { FormEvent, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { runAgentIntake, type AgentIntakeResult } from "../api/agent.js";
import { ArrowUpIcon, ListIcon } from "../icons/index.js";

export default function AgentIntake() {
  const [message, setMessage] = useState("I have 2 acres in Gazipur, sandy loam soil, rainfed, budget 45000, Aman season");
  const [sessionId, setSessionId] = useState("");
  const [language, setLanguage] = useState<"en" | "bn" | "banglish">("en");
  const [result, setResult] = useState<AgentIntakeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await runAgentIntake({
        message,
        sessionId: sessionId || undefined,
        preferredLanguage: language,
      });
      setResult(response);
      setSessionId(response.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intake failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta title="Agent Intake · ICT Fest Admin" description="Standalone intake endpoint console" />
      <PageBreadcrumb pageTitle="Agent Intake" />

      {error && <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <ListIcon />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Intake Turn</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Exercises `/api/agent/intake` directly.</p>
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className={labelClass}>Language</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value as "en" | "bn" | "banglish")} className={inputClass}>
                <option value="en">English</option>
                <option value="banglish">Banglish</option>
                <option value="bn">বাংলা</option>
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Session ID</span>
              <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Optional" className={inputClass} />
            </label>
            <label className="block">
              <span className={labelClass}>Farmer Message</span>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className={`${inputClass} h-auto py-3`} />
            </label>
            <button disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              <ArrowUpIcon width={18} height={18} />
              Send turn
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {result && (
            <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reply</h2>
              <p className="mt-3 rounded-lg bg-gray-50 p-4 text-sm leading-6 text-gray-700 dark:bg-white/[0.04] dark:text-gray-200">{result.reply}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.missingFields.map((field) => (
                  <span key={field} className="rounded-full bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">{field}</span>
                ))}
                {result.intakeComplete && <span className="rounded-full bg-success-50 px-3 py-1 text-xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-400">intake complete</span>}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Raw Result</h2>
            <pre className="custom-scrollbar max-h-[520px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
              {result ? JSON.stringify(result, null, 2) : "No intake result yet."}
            </pre>
          </div>
        </section>
      </div>
    </>
  );
}

const inputClass = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100 h-11";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";
