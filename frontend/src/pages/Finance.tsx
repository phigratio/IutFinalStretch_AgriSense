import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import PageMeta from "../components/common/PageMeta.js";
import {
  createFinanceEntry,
  deleteFinanceEntry,
  getFinanceAdvice,
  getFinanceSummary,
  type FinanceAgentInsight,
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceSummary,
} from "../api/finance.js";
import { CreditCardIcon, PlusIcon, SearchIcon, TrashIcon } from "../icons/index.js";

const currentYear = new Date().getFullYear();
const inputClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";

export default function Finance() {
  const latestPlan = useMemo(readLatestPlanContext, []);
  const [farmId, setFarmId] = useState(latestPlan.farmId ?? "");
  const [seasonPlanId, setSeasonPlanId] = useState(latestPlan.seasonPlanId ?? "");
  const [year, setYear] = useState(String(currentYear));
  const [season, setSeason] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [advice, setAdvice] = useState<FinanceAgentInsight[] | null>(null);
  const [loading, setLoading] = useState("summary");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    entryType: "expense" as FinanceEntryType,
    category: "labor",
    label: "",
    amountBdt: "",
    entryDate: new Date().toISOString().slice(0, 10),
    season: latestPlan.season ?? "monsoon",
    crop: latestPlan.crop ?? "",
  });

  async function refresh() {
    setLoading("summary");
    setError(null);
    try {
      const result = await getFinanceSummary({
        farmId: farmId || undefined,
        seasonPlanId: seasonPlanId || undefined,
        year: Number(year),
        season: season || undefined,
      });
      setSummary(result);
      setAdvice(result.agentInsights);
      if (!farmId && result.plan?.farmId) setFarmId(result.plan.farmId);
      if (!seasonPlanId && result.plan?.id) setSeasonPlanId(result.plan.id);
      setForm((prev) => ({
        ...prev,
        season: prev.season || result.plan?.season || "",
        crop: prev.crop || result.plan?.crop || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance summary");
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    void refresh();
    // Run once on page open; explicit refresh handles control changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshAdvice() {
    setLoading("advice");
    setError(null);
    try {
      const result = await getFinanceAdvice({
        farmId: farmId || undefined,
        seasonPlanId: seasonPlanId || undefined,
        year: Number(year),
        season: season || undefined,
      });
      setAdvice(result.agentInsights);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finance agent failed");
    } finally {
      setLoading("");
    }
  }

  async function submitEntry(event: FormEvent) {
    event.preventDefault();
    if (!form.label.trim()) return;
    setLoading("entry");
    setError(null);
    try {
      await createFinanceEntry({
        farmId: farmId || undefined,
        seasonPlanId: seasonPlanId || undefined,
        entryType: form.entryType,
        category: form.category,
        label: form.label,
        amountBdt: Number(form.amountBdt),
        entryDate: form.entryDate,
        season: form.season || undefined,
        crop: form.crop || undefined,
      });
      setForm((prev) => ({ ...prev, label: "", amountBdt: "" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save ledger entry");
    } finally {
      setLoading("");
    }
  }

  async function removeEntry(entry: FinanceEntry) {
    setLoading(entry.id);
    setError(null);
    try {
      await deleteFinanceEntry(entry.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete ledger entry");
    } finally {
      setLoading("");
    }
  }

  const entries = summary?.entries ?? [];
  const plannedCosts = entries.filter((entry) => entry.source === "season_plan" && entry.entryType === "expense");
  const actualEntries = entries.filter((entry) => entry.source !== "season_plan");
  const selectedInsights = advice ?? summary?.agentInsights ?? [];

  return (
    <>
      <PageMeta title="Finance Management · ICT Fest Admin" description="Season finance projection and ledger" />
      <PageBreadcrumb pageTitle="Finance Management" />

      {error && <Alert>{error}</Alert>}

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_160px_120px]">
          <Field label="Farm ID">
            <input value={farmId} onChange={(event) => setFarmId(event.target.value)} placeholder="Latest farm if blank" className={inputClass} />
          </Field>
          <Field label="Plan ID">
            <input value={seasonPlanId} onChange={(event) => setSeasonPlanId(event.target.value)} placeholder="Latest plan if blank" className={inputClass} />
          </Field>
          <Field label="Year">
            <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" className={inputClass} />
          </Field>
          <Field label="Season">
            <select value={season} onChange={(event) => setSeason(event.target.value)} className={inputClass}>
              <option value="">All seasons</option>
              <option value="monsoon">Monsoon</option>
              <option value="aman">Aman</option>
              <option value="rabi">Rabi</option>
              <option value="kharif">Kharif</option>
            </select>
          </Field>
          <button onClick={refresh} disabled={Boolean(loading)} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
            <SearchIcon width={17} height={17} />
            Refresh
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-4">
          <KpiGrid summary={summary} />
          <MonthlyProjection summary={summary} />
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <LedgerForm form={form} setForm={setForm} onSubmit={submitEntry} loading={loading === "entry"} />
            <LedgerTable entries={actualEntries} loadingId={loading} onDelete={removeEntry} />
          </div>
          <CostBreakdown entries={plannedCosts} summary={summary} />
        </main>

        <aside className="space-y-4">
          <AgentPanel insights={selectedInsights} onRefresh={refreshAdvice} loading={loading === "advice"} />
          <SeasonSummary summary={summary} selectedSeason={season} onSeason={setSeason} />
          <TracePanel summary={summary} />
        </aside>
      </div>
    </>
  );
}

function KpiGrid({ summary }: { summary: FinanceSummary | null }) {
  const totals = summary?.totals;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi title="Income" value={money(totals?.totalIncomeBdt)} tone="success" />
      <Kpi title="Expense" value={money(totals?.totalExpenseBdt)} tone="warning" />
      <Kpi title="Net profit" value={money(totals?.netProfitBdt)} tone={(totals?.netProfitBdt ?? 0) >= 0 ? "success" : "warning"} />
      <Kpi title="ROI" value={totals ? `${totals.roiPct}%` : "-"} tone="info" />
    </section>
  );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone: "success" | "warning" | "info" }) {
  const toneClass = tone === "success" ? "text-success-600" : tone === "warning" ? "text-warning-600" : "text-brand-500";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function MonthlyProjection({ summary }: { summary: FinanceSummary | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Yearly Projection</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Monthly income, expense, and profit from plan + ledger + payments.</p>
        </div>
        {summary?.plan && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-white/10 dark:text-gray-200">
            {summary.plan.crop} · {summary.plan.season ?? "season"}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800">
            <tr>
              <th className="py-3 pr-3">Month</th>
              <th className="py-3 pr-3">Season</th>
              <th className="py-3 pr-3 text-right">Income</th>
              <th className="py-3 pr-3 text-right">Expense</th>
              <th className="py-3 text-right">Profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {(summary?.monthly ?? []).map((month) => (
              <tr key={month.month}>
                <td className="py-3 pr-3 font-medium text-gray-800 dark:text-gray-100">{month.label}</td>
                <td className="py-3 pr-3 text-gray-500 dark:text-gray-400">{month.season}</td>
                <td className="py-3 pr-3 text-right text-success-600">{money(month.incomeBdt)}</td>
                <td className="py-3 pr-3 text-right text-warning-600">{money(month.expenseBdt)}</td>
                <td className={`py-3 text-right font-medium ${month.profitBdt >= 0 ? "text-success-600" : "text-error-600"}`}>{money(month.profitBdt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!summary && <Empty>Finance data will appear after the first AgriSense plan or after refresh.</Empty>}
    </section>
  );
}

function LedgerForm({
  form,
  setForm,
  onSubmit,
  loading,
}: {
  form: {
    entryType: FinanceEntryType;
    category: string;
    label: string;
    amountBdt: string;
    entryDate: string;
    season: string;
    crop: string;
  };
  setForm: (value: typeof form | ((prev: typeof form) => typeof form)) => void;
  onSubmit: (event: FormEvent) => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Manual Ledger</h2>
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <select value={form.entryType} onChange={(event) => setForm((prev) => ({ ...prev, entryType: event.target.value as FinanceEntryType }))} className={inputClass}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </Field>
        <Field label="Category">
          <input value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))} className={inputClass} />
        </Field>
        <Field label="Label">
          <input value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} placeholder="Seed purchase, labor, sale" className={inputClass} />
        </Field>
        <Field label="Amount BDT">
          <input value={form.amountBdt} onChange={(event) => setForm((prev) => ({ ...prev, amountBdt: event.target.value }))} inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Date">
          <input type="date" value={form.entryDate} onChange={(event) => setForm((prev) => ({ ...prev, entryDate: event.target.value }))} className={inputClass} />
        </Field>
        <Field label="Season">
          <input value={form.season} onChange={(event) => setForm((prev) => ({ ...prev, season: event.target.value }))} className={inputClass} />
        </Field>
        <Field label="Crop">
          <input value={form.crop} onChange={(event) => setForm((prev) => ({ ...prev, crop: event.target.value }))} className={inputClass} />
        </Field>
        <button disabled={loading || !form.label || !form.amountBdt} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
          <PlusIcon width={17} height={17} />
          Add entry
        </button>
      </form>
    </section>
  );
}

function LedgerTable({ entries, loadingId, onDelete }: { entries: FinanceEntry[]; loadingId: string; onDelete: (entry: FinanceEntry) => void }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Actual Entries</h2>
      <div className="max-h-[390px] overflow-auto">
        <table className="min-w-full text-left text-sm">
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="py-3 pr-3">
                  <p className="font-medium text-gray-800 dark:text-gray-100">{entry.label}</p>
                  <p className="text-xs text-gray-500">{entry.entryDate} · {entry.category} · {entry.source}</p>
                </td>
                <td className={`py-3 pr-3 text-right font-medium ${entry.entryType === "income" ? "text-success-600" : "text-warning-600"}`}>{money(entry.amountBdt)}</td>
                <td className="py-3 text-right">
                  {entry.editable && (
                    <button disabled={loadingId === entry.id} onClick={() => onDelete(entry)} aria-label="Delete entry" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 hover:bg-error-50 hover:text-error-600 disabled:opacity-60">
                      <TrashIcon width={16} height={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <Empty>No actual ledger, payment, or marketplace entries found yet.</Empty>}
      </div>
    </section>
  );
}

function CostBreakdown({ entries, summary }: { entries: FinanceEntry[]; summary: FinanceSummary | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Inspectable Financial Math</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Profit = revenue - costs. ROI = profit / costs. Break-even price = total cost / expected yield.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{entry.label}</span>
              <span className="shrink-0 font-medium text-warning-600">{money(entry.amountBdt)}</span>
            </div>
          ))}
          {entries.length === 0 && <Empty>No planned cost items found yet.</Empty>}
        </div>
        <div className="rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
          <p>Revenue: {money(summary?.totals.totalIncomeBdt)}</p>
          <p>Costs: {money(summary?.totals.totalExpenseBdt)}</p>
          <p>Profit: {money(summary?.totals.netProfitBdt)}</p>
          <p>ROI: {summary?.totals.roiPct ?? "-"}%</p>
          <p>Break-even yield: {number(summary?.totals.breakEvenYieldKg)} kg</p>
          <p>Break-even price: {money(summary?.totals.breakEvenPriceBdtPerKg)}/kg</p>
        </div>
      </div>
    </section>
  );
}

function AgentPanel({ insights, onRefresh, loading }: { insights: FinanceAgentInsight[]; onRefresh: () => void; loading: boolean }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
            <CreditCardIcon width={18} height={18} />
          </span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Finance Agent</h2>
        </div>
        <button onClick={onRefresh} disabled={loading} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.04]">
          Analyze
        </button>
      </div>
      <div className="space-y-3">
        {insights.map((insight) => (
          <div key={`${insight.title}-${insight.message}`} className="rounded-lg bg-gray-50 p-3 dark:bg-white/[0.04]">
            <p className={`text-sm font-semibold ${insight.severity === "warning" ? "text-warning-600" : insight.severity === "success" ? "text-success-600" : "text-brand-500"}`}>{insight.title}</p>
            <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{insight.message}</p>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{insight.action}</p>
          </div>
        ))}
        {insights.length === 0 && <Empty>Run analysis after a plan or ledger entries exist.</Empty>}
      </div>
    </section>
  );
}

function SeasonSummary({ summary, selectedSeason, onSeason }: { summary: FinanceSummary | null; selectedSeason: string; onSeason: (season: string) => void }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Season Filter</h2>
      <div className="space-y-2">
        <button onClick={() => onSeason("")} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedSeason === "" ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "bg-gray-50 text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"}`}>
          All seasons
        </button>
        {(summary?.seasons ?? []).map((item) => (
          <button key={item.season} onClick={() => onSeason(item.season)} className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedSeason === item.season ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15" : "bg-gray-50 text-gray-700 dark:bg-white/[0.04] dark:text-gray-200"}`}>
            <span className="block font-medium">{item.season}</span>
            <span className="text-xs text-gray-500">{money(item.profitBdt)} profit · {item.entryCount} entries</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function TracePanel({ summary }: { summary: FinanceSummary | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Finance Trace</h2>
      <div className="space-y-2">
        {(summary?.trace ?? []).map((event) => (
          <details key={event.traceId ?? event.toolName} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.04]">
            <summary className="cursor-pointer font-medium text-gray-800 dark:text-gray-100">{event.kind} · {event.toolName}</summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-950 p-3 text-xs text-gray-100">
              {JSON.stringify({ parameters: event.parameters, rawResponse: event.rawResponse }, null, 2)}
            </pre>
          </details>
        ))}
        {!summary?.trace?.length && <Empty>No finance trace yet.</Empty>}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{children}</div>;
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-sm text-gray-500 dark:text-gray-400">{children}</p>;
}

function money(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return `BDT ${Math.round(value).toLocaleString("en-BD")}`;
}

function number(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value)) return "-";
  return Math.round(value).toLocaleString("en-BD");
}

function readLatestPlanContext(): { farmId?: string; seasonPlanId?: string; crop?: string; season?: string } {
  try {
    const raw = localStorage.getItem("agrisense.latestPlan");
    if (!raw) return {};
    const parsed = JSON.parse(raw) as {
      farmId?: string;
      farmProfile?: { targetSeason?: string };
      seasonPlan?: { id?: string; crop?: string };
    };
    return {
      farmId: parsed.farmId,
      seasonPlanId: parsed.seasonPlan?.id,
      crop: parsed.seasonPlan?.crop,
      season: parsed.farmProfile?.targetSeason,
    };
  } catch {
    return {};
  }
}
