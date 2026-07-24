import { FormEvent, useMemo, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { sendAgriSenseMessage, type AgriSenseMessageResult, type SeasonPlanTask } from "../api/agrisense.js";
import { ArrowDownIcon, ArrowUpIcon, CalendarIcon } from "../icons/index.js";

const phaseColors: Record<string, string> = {
  "land-prep": "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200",
  sowing: "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/[0.10] dark:text-success-400",
  fertilizer: "border-warning-300 bg-warning-50 text-warning-700 dark:border-warning-500/40 dark:bg-warning-500/[0.10] dark:text-warning-400",
  irrigation: "border-brand-300 bg-brand-50 text-brand-600 dark:border-brand-500/40 dark:bg-brand-500/[0.10] dark:text-brand-300",
  weed: "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-gray-200",
  "pest-check": "border-error-300 bg-error-50 text-error-600 dark:border-error-500/40 dark:bg-error-500/[0.10] dark:text-error-400",
  harvest: "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/[0.10] dark:text-success-400",
};

const defaultRequest = "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman";

export default function Calendar() {
  const [request, setRequest] = useState(defaultRequest);
  const [result, setResult] = useState<AgriSenseMessageResult | null>(() => readStoredPlan());
  const [monthCursor, setMonthCursor] = useState(() => {
    const sowDate = readStoredPlan()?.seasonPlan?.sowDate;
    return monthStart(sowDate ? new Date(`${sowDate}T00:00:00`) : new Date());
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = result?.seasonPlan;
  const tasks = plan?.tasks ?? [];
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedDate && dateInRange(selectedDate, task.startDate, task.endDate)),
    [selectedDate, tasks],
  );
  const schedulerTasks = tasks.filter((task) => task.phase === "fertilizer" || task.phase === "irrigation");

  async function generatePlan(event: FormEvent) {
    event.preventDefault();
    const text = request.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    try {
      const response = await sendAgriSenseMessage({
        message: text,
        workflowStage: "full",
        triggerReason: "user_requested_replan",
      });
      setResult(response);
      if (response.seasonPlan) {
        localStorage.setItem("agrisense.latestPlan", JSON.stringify(response));
        setMonthCursor(monthStart(new Date(`${response.seasonPlan.sowDate}T00:00:00`)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate calendar plan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta title="Season Calendar · AgriSense" description="Daily season plan calendar" />
      <PageBreadcrumb pageTitle="Season Calendar" />

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
        <main className="space-y-4">
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Season Daily Plan</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Calendar generated from the AgriSense backend season plan.
                </p>
              </div>
              <form onSubmit={generatePlan} className="flex w-full gap-2 lg:max-w-2xl">
                <input
                  value={request}
                  onChange={(event) => setRequest(event.target.value)}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100"
                  placeholder="Farm details for calendar plan"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  Generate
                </button>
              </form>
            </div>
            {plan && (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Crop" value={plan.crop} />
                <Metric label="Sowing" value={formatShortDate(plan.sowDate)} />
                <Metric label="Harvest" value={`${formatShortDate(plan.harvestStartDate)} - ${formatShortDate(plan.harvestEndDate)}`} />
                <Metric label="Plan cost" value={formatMoney(plan.financials.totalCostBdt)} />
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <CalendarIcon width={18} height={18} />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {new Intl.DateTimeFormat("en-BD", { month: "long", year: "numeric" }).format(monthCursor)}
                </h2>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMonthCursor(addMonths(monthCursor, -1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]" aria-label="Previous month">
                  <ArrowDownIcon width={16} height={16} />
                </button>
                <button type="button" onClick={() => setMonthCursor(addMonths(monthCursor, 1))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-white/[0.05]" aria-label="Next month">
                  <ArrowUpIcon width={16} height={16} />
                </button>
              </div>
            </div>
            <CalendarGrid
              monthCursor={monthCursor}
              tasks={tasks}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </section>
        </main>

        <aside className="space-y-4">
          <SchedulerPanel tasks={schedulerTasks} crop={plan?.crop} soil={result?.farmProfile.soilType} />
          <DayPanel selectedDate={selectedDate} tasks={selectedTasks} />
        </aside>
      </div>
    </>
  );
}

function CalendarGrid({
  monthCursor,
  tasks,
  selectedDate,
  onSelectDate,
}: {
  monthCursor: Date;
  tasks: SeasonPlanTask[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const days = calendarDays(monthCursor);
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-200 text-center text-xs font-medium text-gray-500 dark:border-gray-800 dark:text-gray-400">
        {["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"].map((day) => (
          <div key={day} className="px-2 py-2">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const iso = toIsoDate(day);
          const dayTasks = tasks.filter((task) => dateInRange(iso, task.startDate, task.endDate));
          const isCurrentMonth = day.getMonth() === monthCursor.getMonth();
          const active = selectedDate === iso;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelectDate(iso)}
              className={`min-h-[118px] border-b border-r border-gray-200 p-2 text-left align-top transition-colors dark:border-gray-800 ${
                active ? "bg-brand-50 dark:bg-brand-500/[0.10]" : "hover:bg-gray-50 dark:hover:bg-white/[0.04]"
              } ${isCurrentMonth ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold">{day.getDate()}</span>
                {dayTasks.length > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.08] dark:text-gray-300">
                    {dayTasks.length}
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <div key={`${iso}-${task.phase}-${task.title}`} className={`truncate rounded-md border px-2 py-1 text-[11px] ${phaseColors[task.phase] ?? phaseColors["land-prep"]}`}>
                    {task.title}
                  </div>
                ))}
                {dayTasks.length > 3 && <p className="text-[11px] text-gray-500">+{dayTasks.length - 3} more</p>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SchedulerPanel({ tasks, crop, soil }: { tasks: SeasonPlanTask[]; crop?: string; soil?: string }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Fertilizer & Irrigation Scheduler</h2>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {crop ? `${crop} on ${soil ?? "unknown"} soil` : "Generate a season plan to populate scheduler tasks."}
      </p>
      <div className="mt-4 space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No fertilizer or irrigation tasks yet.</p>
        ) : (
          tasks.map((task) => <SchedulerTask key={`${task.phase}-${task.startDate}`} task={task} />)
        )}
      </div>
    </section>
  );
}

function SchedulerTask({ task }: { task: SeasonPlanTask }) {
  return (
    <div className={`rounded-lg border p-3 ${phaseColors[task.phase] ?? phaseColors["land-prep"]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{task.title}</h3>
          <p className="mt-1 text-xs">{formatShortDate(task.startDate)} - {formatShortDate(task.endDate)}</p>
        </div>
        <span className="rounded-full bg-white/70 px-2 py-1 text-xs font-semibold dark:bg-black/20">
          {task.phase}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallMetric label="Growth stage" value={task.growthStage ?? "stage check"} />
        <SmallMetric label="Quantity" value={task.quantity ? `${task.quantity} ${task.unit ?? ""}` : "field check"} />
        <SmallMetric label="Unit cost" value={task.unitCostBdt ? formatMoney(task.unitCostBdt) : "n/a"} />
        <SmallMetric label="Total cost" value={task.totalCostBdt ? formatMoney(task.totalCostBdt) : "n/a"} />
      </div>
      <p className="mt-3 text-xs leading-5">{task.description}</p>
      {task.organicAlternative && (
        <p className="mt-2 rounded-md bg-white/70 px-2 py-2 text-xs leading-5 dark:bg-black/20">
          Organic option: {task.organicAlternative}
        </p>
      )}
      <p className="mt-2 text-xs leading-5">{task.reasoning}</p>
    </div>
  );
}

function DayPanel({ selectedDate, tasks }: { selectedDate: string | null; tasks: SeasonPlanTask[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
        {selectedDate ? formatLongDate(selectedDate) : "Selected Day"}
      </h2>
      <div className="mt-4 space-y-3">
        {!selectedDate ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Select a calendar day to inspect tasks.</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No scheduled task for this day.</p>
        ) : (
          tasks.map((task) => (
            <div key={`${task.phase}-${task.startDate}`} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.description}</p>
              <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.reasoning}</p>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold capitalize text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-white/70 px-2 py-1.5 dark:bg-black/20">
      <p className="text-[11px] opacity-75">{label}</p>
      <p className="mt-0.5 truncate text-xs font-semibold">{value}</p>
    </div>
  );
}

function readStoredPlan(): AgriSenseMessageResult | null {
  try {
    const stored = localStorage.getItem("agrisense.latestPlan");
    return stored ? (JSON.parse(stored) as AgriSenseMessageResult) : null;
  } catch {
    return null;
  }
}

function calendarDays(month: Date): Date[] {
  const start = monthStart(month);
  const saturdayOffset = (start.getDay() + 1) % 7;
  const first = addDays(start, -saturdayOffset);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

function formatMoney(value: number): string {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}
