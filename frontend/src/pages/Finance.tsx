import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { Link, useSearchParams } from "react-router-dom";
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

type FinanceView = "overview" | "math" | "management" | "agent";

const currentYear = new Date().getFullYear();
const inputClass =
  "h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";

export default function Finance() {
  const [params, setParams] = useSearchParams();
  const latestPlan = useMemo(readLatestPlanContext, []);
  const [farmId, setFarmId] = useState(latestPlan.farmId ?? "");
  const [seasonPlanId, setSeasonPlanId] = useState(latestPlan.seasonPlanId ?? "");
  const [year, setYear] = useState(String(currentYear));
  const [season, setSeason] = useState("");
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [history, setHistory] = useState<FinanceSummary[]>([]);
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

  const activeView = normalizeView(params.get("view"));
  const entries = summary?.entries ?? [];
  const plannedCosts = entries.filter((entry) => entry.source === "season_plan" && entry.entryType === "expense");
  const actualEntries = entries.filter((entry) => entry.source !== "season_plan");
  const selectedInsights = advice ?? summary?.agentInsights ?? [];

  async function refresh() {
    const selectedYear = Number(year) || currentYear;
    setLoading("summary");
    setError(null);
    try {
      const years = [selectedYear, selectedYear - 1, selectedYear - 2];
      const results = await Promise.all(
        years.map((targetYear) =>
          getFinanceSummary({
            farmId: farmId || undefined,
            seasonPlanId: seasonPlanId || undefined,
            year: targetYear,
            season: season || undefined,
          }),
        ),
      );
      const [current] = results;
      setSummary(current);
      setHistory(results);
      setAdvice(current.agentInsights);
      if (!farmId && current.plan?.farmId) setFarmId(current.plan.farmId);
      if (!seasonPlanId && current.plan?.id) setSeasonPlanId(current.plan.id);
      setForm((prev) => ({
        ...prev,
        season: prev.season || current.plan?.season || "",
        crop: prev.crop || current.plan?.crop || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance summary");
    } finally {
      setLoading("");
    }
  }

  useEffect(() => {
    void refresh();
    // Initial load only; explicit refresh handles filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeView(next: FinanceView) {
    const updated = new URLSearchParams(params);
    if (next === "overview") updated.delete("view");
    else updated.set("view", next);
    setParams(updated, { replace: true });
  }

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
        label: form.label.trim(),
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

  return (
    <>
      <PageMeta title="Finance Dashboard · ICT Fest Admin" description="Financial math, yearly trend, and farm ledger dashboard" />
      <PageBreadcrumb pageTitle="Finance Dashboard" />

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-500">Farm finance</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">Financial performance dashboard</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
              Review projected and actual farm cash flow, compare yearly performance, inspect formulas, and manage the ledger behind AgriSense plans.
            </p>
          </div>
          <div className="grid gap-2 rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.04] sm:grid-cols-2 xl:min-w-[420px]">
            <Mini label="Current plan" value={summary?.plan ? `${summary.plan.crop} · ${summary.plan.season ?? "season"}` : "No plan selected"} />
            <Mini label="Data window" value={`${Number(year) || currentYear}-${(Number(year) || currentYear) - 2}`} />
            <Mini label="Entries" value={String(entries.length)} />
            <Mini label="Status" value={loading ? "Refreshing" : "Ready"} />
          </div>
        </div>
      </section>

      {error && <Alert>{error}</Alert>}

      <Filters
        farmId={farmId}
        seasonPlanId={seasonPlanId}
        year={year}
        season={season}
        loading={Boolean(loading)}
        onFarmId={setFarmId}
        onSeasonPlanId={setSeasonPlanId}
        onYear={setYear}
        onSeason={setSeason}
        onRefresh={refresh}
      />

      <ViewTabs activeView={activeView} onChange={changeView} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-4">
          <KpiGrid summary={summary} />
          {activeView === "overview" && (
            <>
              <ChartGrid summary={summary} history={history} />
              <MonthlyTable summary={summary} />
            </>
          )}
          {activeView === "math" && (
            <>
              <ChartGrid summary={summary} history={history} />
              <FinancialMath summary={summary} entries={plannedCosts} />
            </>
          )}
          {activeView === "management" && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <LedgerForm form={form} setForm={setForm} onSubmit={submitEntry} loading={loading === "entry"} />
              <LedgerTable entries={actualEntries} loadingId={loading} onDelete={removeEntry} />
            </div>
          )}
          {activeView === "agent" && <TracePanel summary={summary} expanded />}
        </main>

        <aside className="space-y-4">
          <AgentPanel insights={selectedInsights} onRefresh={refreshAdvice} loading={loading === "advice"} />
          <SeasonSummary summary={summary} selectedSeason={season} onSeason={setSeason} />
          <PlanCard summary={summary} />
          {activeView !== "agent" && <TracePanel summary={summary} />}
        </aside>
      </div>
    </>
  );
}

function Filters(props: {
  farmId: string;
  seasonPlanId: string;
  year: string;
  season: string;
  loading: boolean;
  onFarmId: (value: string) => void;
  onSeasonPlanId: (value: string) => void;
  onYear: (value: string) => void;
  onSeason: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_160px_120px]">
        <Field label="Farm ID">
          <input value={props.farmId} onChange={(event) => props.onFarmId(event.target.value)} placeholder="Latest farm if blank" className={inputClass} />
        </Field>
        <Field label="Plan ID">
          <input value={props.seasonPlanId} onChange={(event) => props.onSeasonPlanId(event.target.value)} placeholder="Latest plan if blank" className={inputClass} />
        </Field>
        <Field label="Year">
          <input value={props.year} onChange={(event) => props.onYear(event.target.value)} inputMode="numeric" className={inputClass} />
        </Field>
        <Field label="Season">
          <select value={props.season} onChange={(event) => props.onSeason(event.target.value)} className={inputClass}>
            <option value="">All seasons</option>
            <option value="monsoon">Monsoon</option>
            <option value="aman">Aman</option>
            <option value="rabi">Rabi</option>
            <option value="kharif">Kharif</option>
          </select>
        </Field>
        <button onClick={props.onRefresh} disabled={props.loading} className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-500 px-3 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
          <SearchIcon width={17} height={17} />
          Refresh
        </button>
      </div>
    </section>
  );
}

function ViewTabs({ activeView, onChange }: { activeView: FinanceView; onChange: (view: FinanceView) => void }) {
  const views: Array<{ id: FinanceView; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "math", label: "Financial Math" },
    { id: "management", label: "Ledger" },
    { id: "agent", label: "Agent & Trace" },
  ];
  return (
    <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-white/[0.03]">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onChange(view.id)}
          className={`h-10 rounded-lg px-4 text-sm font-medium transition-colors ${
            activeView === view.id
              ? "bg-brand-500 text-white"
              : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          }`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

function KpiGrid({ summary }: { summary: FinanceSummary | null }) {
  const totals = summary?.totals;
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi title="Income" value={money(totals?.totalIncomeBdt)} tone="success" detail="Revenue, payments, and sale entries" />
      <Kpi title="Expense" value={money(totals?.totalExpenseBdt)} tone="warning" detail="Plan costs plus actual ledger spend" />
      <Kpi title="Net profit" value={money(totals?.netProfitBdt)} tone={(totals?.netProfitBdt ?? 0) >= 0 ? "success" : "warning"} detail="Income minus expenses" />
      <Kpi title="ROI" value={totals ? `${totals.roiPct}%` : "-"} tone="info" detail="Profit divided by total expense" />
    </section>
  );
}

function Kpi({ title, value, tone, detail }: { title: string; value: string; tone: "success" | "warning" | "info"; detail: string }) {
  const toneClass = tone === "success" ? "text-success-600" : tone === "warning" ? "text-warning-600" : "text-brand-500";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{title}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function ChartGrid({ summary, history }: { summary: FinanceSummary | null; history: FinanceSummary[] }) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
      <ChartCard title="Monthly cash flow" subtitle="Income, expense, and profit by month">
        <MonthlyCashflowChart summary={summary} />
      </ChartCard>
      <ChartCard title="Expense mix" subtitle="Projected and actual cost categories">
        <ExpenseDonut entries={summary?.entries ?? []} />
      </ChartCard>
      <ChartCard title="Yearly comparison" subtitle="Current year plus the two previous years" className="xl:col-span-2">
        <YearlyChart history={history} />
      </ChartCard>
    </section>
  );
}

function ChartCard({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function MonthlyCashflowChart({ summary }: { summary: FinanceSummary | null }) {
  const rows = summary?.monthly ?? [];
  const options: ApexOptions = {
    chart: { toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    colors: ["#12b76a", "#f79009", "#465fff"],
    dataLabels: { enabled: false },
    grid: { borderColor: "#e4e7ec" },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "55%" } },
    xaxis: { categories: rows.map((row) => row.label), labels: { rotate: -35 } },
    yaxis: { labels: { formatter: (value) => `${Math.round(value / 1000)}k` } },
    tooltip: { y: { formatter: (value) => money(value) } },
    legend: { position: "top" },
  };
  const series = [
    { name: "Income", data: rows.map((row) => row.incomeBdt) },
    { name: "Expense", data: rows.map((row) => row.expenseBdt) },
    { name: "Profit", data: rows.map((row) => row.profitBdt) },
  ];
  return rows.length ? <Chart options={options} series={series} type="bar" height={320} /> : <Empty>No monthly finance data yet.</Empty>;
}

function ExpenseDonut({ entries }: { entries: FinanceEntry[] }) {
  const buckets = entries
    .filter((entry) => entry.entryType === "expense")
    .reduce<Record<string, number>>((acc, entry) => {
      acc[entry.category] = (acc[entry.category] ?? 0) + entry.amountBdt;
      return acc;
    }, {});
  const labels = Object.keys(buckets);
  const values = labels.map((label) => Math.round(buckets[label]));
  const options: ApexOptions = {
    labels,
    chart: { fontFamily: "Outfit, sans-serif" },
    colors: ["#465fff", "#12b76a", "#f79009", "#f04438", "#7a5af8", "#06aed4"],
    legend: { position: "bottom" },
    dataLabels: { enabled: true },
    tooltip: { y: { formatter: (value) => money(value) } },
  };
  return values.length ? <Chart options={options} series={values} type="donut" height={320} /> : <Empty>No expense categories yet.</Empty>;
}

function YearlyChart({ history }: { history: FinanceSummary[] }) {
  const rows = [...history].sort((a, b) => a.query.year - b.query.year);
  const options: ApexOptions = {
    chart: { toolbar: { show: false }, fontFamily: "Outfit, sans-serif" },
    colors: ["#12b76a", "#f79009", "#465fff"],
    dataLabels: { enabled: false },
    plotOptions: { bar: { borderRadius: 4, columnWidth: "45%" } },
    xaxis: { categories: rows.map((row) => String(row.query.year)) },
    yaxis: { labels: { formatter: (value) => `${Math.round(value / 1000)}k` } },
    tooltip: { y: { formatter: (value) => money(value) } },
    legend: { position: "top" },
  };
  const series = [
    { name: "Income", data: rows.map((row) => row.totals.totalIncomeBdt) },
    { name: "Expense", data: rows.map((row) => row.totals.totalExpenseBdt) },
    { name: "Net profit", data: rows.map((row) => row.totals.netProfitBdt) },
  ];
  return rows.length ? <Chart options={options} series={series} type="bar" height={280} /> : <Empty>No yearly finance history yet.</Empty>;
}

function MonthlyTable({ summary }: { summary: FinanceSummary | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Monthly projection</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Backend-calculated monthly income, expense, and profit.</p>
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

function FinancialMath({ entries, summary }: { entries: FinanceEntry[]; summary: FinanceSummary | null }) {
  const totals = summary?.totals;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Inspectable Financial Math</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        This is the finance engine output behind the AgriSense plan: revenue, cost, profit, ROI, and break-even.
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Formula title="Net profit" expression="income - expense" value={`${money(totals?.totalIncomeBdt)} - ${money(totals?.totalExpenseBdt)} = ${money(totals?.netProfitBdt)}`} />
        <Formula title="ROI" expression="profit / expense x 100" value={totals ? `${totals.roiPct}%` : "-"} />
        <Formula title="Budget surplus" expression="budget - expense" value={totals?.budgetBdt === undefined ? "-" : money(totals.budgetSurplusBdt)} />
        <Formula title="Break-even yield" expression="cost / price per kg" value={`${number(totals?.breakEvenYieldKg)} kg`} />
        <Formula title="Break-even price" expression="cost / expected yield" value={`${money(totals?.breakEvenPriceBdtPerKg)}/kg`} />
        <Formula title="Plan confidence" expression="positive profit + budget room" value={(totals?.netProfitBdt ?? 0) >= 0 ? "Viable" : "Needs review"} />
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
              <span className="min-w-0 truncate text-gray-700 dark:text-gray-200">{entry.label}</span>
              <span className="shrink-0 font-medium text-warning-600">{money(entry.amountBdt)}</span>
            </div>
          ))}
          {entries.length === 0 && (
            <Empty>
              No planned cost items found yet. <Link to="/agrisense?stage=season_plan" className="font-medium text-brand-500 hover:underline">Create an AgriSense season plan first.</Link>
            </Empty>
          )}
        </div>
        <div className="rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
          <p>Revenue: {money(totals?.totalIncomeBdt)}</p>
          <p>Costs: {money(totals?.totalExpenseBdt)}</p>
          <p>Profit: {money(totals?.netProfitBdt)}</p>
          <p>ROI: {totals?.roiPct ?? "-"}%</p>
          <p>Break-even yield: {number(totals?.breakEvenYieldKg)} kg</p>
          <p>Break-even price: {money(totals?.breakEvenPriceBdtPerKg)}/kg</p>
        </div>
      </div>
    </section>
  );
}

function Formula({ title, expression, value }: { title: string; expression: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{expression}</p>
      <p className="mt-3 text-lg font-semibold text-brand-500">{value}</p>
    </div>
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

function PlanCard({ summary }: { summary: FinanceSummary | null }) {
  const plan = summary?.plan;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-base font-semibold text-gray-900 dark:text-white">Plan context</h2>
      {plan ? (
        <div className="mt-3 grid gap-2 text-sm">
          <Mini label="Crop" value={plan.crop} />
          <Mini label="Season" value={plan.season ?? "n/a"} />
          <Mini label="Expected yield" value={`${number(plan.expectedYieldKg)} kg`} />
          <Mini label="Expected revenue" value={money(plan.expectedRevenueBdt)} />
        </div>
      ) : (
        <Empty>
          Create an AgriSense season plan first, then this dashboard will show projected finance data.
        </Empty>
      )}
    </section>
  );
}

function TracePanel({ summary, expanded = false }: { summary: FinanceSummary | null; expanded?: boolean }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">Finance Trace</h2>
      <div className="space-y-2">
        {(summary?.trace ?? []).map((event) => (
          <details key={event.traceId ?? event.toolName} open={expanded} className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-white/[0.04]">
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

function FormulaValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return <FormulaValue label={label} value={value} />;
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

function normalizeView(value: string | null): FinanceView {
  if (value === "math" || value === "management" || value === "agent") return value;
  return "overview";
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
