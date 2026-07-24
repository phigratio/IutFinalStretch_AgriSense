import { FormEvent, useMemo, useRef, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import {
  sendAgriSenseMessage,
  type AgriSenseMessageResult,
  type CropRecommendation,
  type IntakeProfile,
  type SeasonPlanTask,
  type TraceEvent,
} from "../api/agrisense.js";
import { ArrowUpIcon, BoxIcon, CalendarIcon, SearchIcon } from "../icons/index.js";

interface ChatMessage {
  role: "farmer" | "agent";
  text: string;
}

type Language = "en" | "bn" | "banglish";

const starterMessages = [
  "I have 2 acres in Gazipur, what should I plant?",
  "amar 2 acre jomi Gazipur e, bele doash mati, brishti er pani, budget 45k, Aman",
  "আমার গাজীপুরে ২ একর জমি, বেলে দোআঁশ মাটি, বৃষ্টির পানি, বাজেট ৪৫ হাজার, আমন",
  "2 acres in Gazipur, sandy loam, rainfed, budget 45k, Aman",
];

const languageLabels: Record<Language, string> = {
  en: "English",
  banglish: "Banglish",
  bn: "বাংলা",
};

const initialAgentText: Record<Language, string> = {
  en: "Tell me what you know about the farm. I will ask only for the missing details.",
  banglish: "Farm niye ja janen bolun. Ami sudhu missing details jiggesh korbo.",
  bn: "খামার সম্পর্কে যা জানেন বলুন। আমি শুধু যে তথ্যগুলো নেই সেগুলো জিজ্ঞেস করব।",
};

export default function AgriSense() {
  const [language, setLanguage] = useState<Language>("en");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      text: initialAgentText.en,
    },
  ]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [farmerId, setFarmerId] = useState<string | undefined>();
  const [farmId, setFarmId] = useState<string | undefined>();
  const [result, setResult] = useState<AgriSenseMessageResult | null>(null);
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activePlan = result?.seasonPlan;
  const profile = result?.farmProfile;

  async function submitMessage(messageText = input) {
    const text = messageText.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "farmer", text }]);

    try {
      const response = await sendAgriSenseMessage({
        message: text,
        sessionId,
        farmerId,
        farmId,
        preferredLanguage: language,
      });

      setSessionId(response.sessionId);
      setFarmerId(response.farmerId);
      setFarmId(response.farmId);
      setResult(response);
      setTrace((current) => [...current, ...response.trace]);
      setMessages((current) => [
        ...current,
        { role: "agent", text: response.assistantMessage },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run AgriSense";
      setError(message);
      setMessages((current) => [...current, { role: "agent", text: message }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submitMessage();
  }

  return (
    <>
      <PageMeta
        title="AgriSense · ICT Fest"
        description="Agentic agricultural advisor workspace"
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            AgriSense AI
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Intake, weather grounding, crop ranking, finance, plan generation, and trace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-lg border border-gray-200 bg-white p-1 dark:border-gray-800 dark:bg-white/[0.03]">
            {(Object.keys(languageLabels) as Language[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setLanguage(option);
                  if (messages.length === 1 && messages[0]?.role === "agent") {
                    setMessages([{ role: "agent", text: initialAgentText[option] }]);
                  }
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  language === option
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                }`}
              >
                {languageLabels[option]}
              </button>
            ))}
          </div>
          {starterMessages.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => void submitMessage(starter)}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
            >
              {starter}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      <div className="grid min-h-[720px] grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.35fr)_minmax(320px,0.95fr)]">
        <section className="flex min-h-[560px] flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Conversation</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Session {sessionId ? shortId(sessionId) : "new"}
            </p>
          </div>
          <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
                  message.role === "farmer"
                    ? "ml-auto bg-brand-500 text-white"
                    : "bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-gray-100"
                }`}
              >
                {message.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 dark:border-gray-800">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={language === "bn" ? "খামারের তথ্য লিখুন..." : language === "banglish" ? "Farm er details likhun..." : "Describe the farm..."}
                className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={loading}
                aria-label="Send message"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60"
              >
                <ArrowUpIcon width={18} height={18} />
              </button>
            </div>
          </form>
        </section>

        <main className="space-y-4">
          <ProfilePanel profile={profile} missingFields={result?.missingFields ?? []} />
          <WeatherPanel result={result} />
          <CropRankings rankings={result?.cropRankings ?? []} />
          {activePlan && <SeasonPlanPanel plan={activePlan} />}
        </main>

        <TracePanel trace={trace} />
      </div>
    </>
  );
}

function ProfilePanel({ profile, missingFields }: { profile?: IntakeProfile; missingFields: string[] }) {
  const fields = [
    ["Location", profile?.locationText],
    ["Farm size", profile?.sizeAcres ? `${profile.sizeAcres} acres` : undefined],
    ["Soil", profile?.soilType],
    ["Water", profile?.waterAvailability],
    ["Budget", profile?.budgetBdt ? formatMoney(profile.budgetBdt) : undefined],
    ["Season", profile?.targetSeason],
  ];

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Farm Profile</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Required intake fields for Tier 0
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            missingFields.length === 0
              ? "bg-success-50 text-success-600"
              : "bg-warning-50 text-warning-600"
          }`}
        >
          {missingFields.length === 0 ? "Complete" : `${missingFields.length} missing`}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className="mt-1 truncate text-sm font-medium text-gray-900 dark:text-white">
              {value ?? "Missing"}
            </p>
          </div>
        ))}
      </div>
      {missingFields.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {missingFields.map((field) => (
            <span
              key={field}
              className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300"
            >
              {field}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function WeatherPanel({ result }: { result: AgriSenseMessageResult | null }) {
  const weather = result?.weather;
  if (!weather) {
    return (
      <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Weather</h2>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Weather fetch starts after intake is complete.
        </p>
      </section>
    );
  }

  const first = weather.daily[0];
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <SearchIcon width={18} height={18} />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Live Weather</h2>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="Provider" value={weather.provider} />
        <Metric label="Rain today" value={`${first?.rainfallMm ?? 0} mm`} />
        <Metric label="Temp today" value={`${first?.temperatureMinC ?? 0}-${first?.temperatureMaxC ?? 0}C`} />
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{weather.locationText}</p>
    </section>
  );
}

function CropRankings({ rankings }: { rankings: CropRecommendation[] }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <BoxIcon width={18} height={18} />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Crop Rankings</h2>
      </div>
      {rankings.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Rankings appear after weather and intake are complete.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {rankings.map((crop) => (
            <CropRow key={crop.crop} crop={crop} />
          ))}
        </div>
      )}
    </section>
  );
}

function CropRow({ crop }: { crop: CropRecommendation }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold capitalize text-gray-900 dark:text-white">{crop.crop}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{crop.reasoning}</p>
        </div>
        <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-600">
          {crop.suitabilityScore}/100
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Water" value={crop.waterNeed} />
        <Metric label="Risk" value={crop.riskLevel} />
        <Metric label="Net" value={formatMoney(crop.netProfitBdt)} />
        <Metric label="ROI" value={`${crop.roiPct}%`} />
      </div>
    </div>
  );
}

function SeasonPlanPanel({ plan }: { plan: NonNullable<AgriSenseMessageResult["seasonPlan"]> }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon width={18} height={18} />
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Season Plan</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{plan.reasoning}</p>
          </div>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
          {plan.crop}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Yield" value={`${plan.financials.expectedYieldKg} kg`} />
        <Metric label="Revenue" value={formatMoney(plan.financials.expectedRevenueBdt)} />
        <Metric label="Net profit" value={formatMoney(plan.financials.netProfitBdt)} />
        <Metric label="Cost" value={formatMoney(plan.financials.totalCostBdt)} />
        <Metric label="ROI" value={`${plan.financials.roiPct}%`} />
        <Metric label="Break-even" value={`${plan.financials.breakEvenYieldKg} kg`} />
      </div>
      <div className="mt-4 space-y-2">
        {plan.tasks.map((task) => (
          <TaskRow key={`${task.phase}-${task.startDate}`} task={task} />
        ))}
      </div>
    </section>
  );
}

function TaskRow({ task }: { task: SeasonPlanTask }) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800 md:grid-cols-[140px_minmax(0,1fr)_110px]">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {formatDate(task.startDate)} - {formatDate(task.endDate)}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.description}</p>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.reasoning}</p>
      </div>
      <div className="text-right text-xs text-gray-600 dark:text-gray-300">
        {task.quantity ? `${task.quantity} ${task.unit ?? ""}` : task.phase}
        {task.totalCostBdt ? <div className="mt-1 font-semibold">{formatMoney(task.totalCostBdt)}</div> : null}
      </div>
    </div>
  );
}

function TracePanel({ trace }: { trace: TraceEvent[] }) {
  const visibleTrace = useMemo(() => trace.slice().reverse(), [trace]);

  return (
    <aside className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Trace</h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Tool calls, parameters, raw returns
        </p>
      </div>
      <div className="custom-scrollbar max-h-[680px] space-y-2 overflow-y-auto p-3">
        {visibleTrace.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No trace events yet.</p>
        ) : (
          visibleTrace.map((event, index) => (
            <details
              key={`${event.toolName}-${index}`}
              className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]"
            >
              <summary className="cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-100">
                {event.status === "error" ? "error" : event.kind} · {event.toolName} · {event.latencyMs}ms
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-gray-700 dark:text-gray-300">
                {JSON.stringify(event, null, 2)}
              </pre>
            </details>
          ))
        )}
      </div>
    </aside>
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

function formatMoney(value: number): string {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
