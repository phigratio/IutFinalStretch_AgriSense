import { FormEvent, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import {
  sendAgriSenseMessage,
  type AgriSenseMessageResult,
  type CropRecommendation,
  type IntakeProfile,
  type SeasonPlanTask,
  type TraceEvent,
  type WorkflowStage,
} from "../api/agrisense.js";
import { ArrowUpIcon, BoxIcon, CalendarIcon, SearchIcon } from "../icons/index.js";

interface ChatMessage {
  role: "farmer" | "agent";
  text: string;
}

type Language = "en" | "bn" | "banglish";
type ViewStage = WorkflowStage | "trace";

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

const workflowStages: Array<{
  id: ViewStage;
  label: string;
  tool: string;
  description: string;
}> = [
  { id: "intake", label: "Intake", tool: "memory + gaps", description: "Recover profile from memory and ask only for missing fields." },
  { id: "weather", label: "Weather", tool: "weather.fetch", description: "Refresh live weather for the farm location." },
  { id: "evidence", label: "Evidence", tool: "rag.retrieve", description: "Retrieve agronomic context for the profile and weather." },
  { id: "crop_ranking", label: "Crop Ranking", tool: "crop.rank", description: "Rank crops from profile, weather, budget, and evidence." },
  { id: "season_plan", label: "Season Plan", tool: "season.plan", description: "Generate dated farming actions for the selected crop." },
  { id: "financials", label: "Financial Math", tool: "finance.calculate", description: "Inspect costs, profit, ROI, and break-even." },
  { id: "trace", label: "Agent Trace", tool: "trace.read", description: "Inspect every tool call, parameter, and raw response." },
  { id: "full", label: "Full Run", tool: "agent.plan", description: "Run the complete agent workflow end to end." },
];

const stageLabels = Object.fromEntries(workflowStages.map((stage) => [stage.id, stage.label])) as Record<ViewStage, string>;

export default function AgriSense() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const activeStage = normalizeStage(searchParams.get("stage"));

  async function submitMessage(messageText = input, workflowStage: WorkflowStage = activeStage === "trace" ? "full" : activeStage) {
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
        workflowStage,
        triggerReason: workflowStage === "weather" ? "weather_refreshed" : workflowStage === "full" ? "user_requested_replan" : undefined,
      });

      setSessionId(response.sessionId);
      setFarmerId(response.farmerId);
      setFarmId(response.farmId);
      setResult(response);
      if (response.seasonPlan) {
        localStorage.setItem("agrisense.latestPlan", JSON.stringify(response));
      }
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

  function selectStage(stage: ViewStage) {
    setSearchParams(stage === "full" ? {} : { stage });
  }

  function runStage(stage: ViewStage) {
    selectStage(stage);
    if (stage === "trace") return;
    const message = stage === "intake"
      ? "continue intake"
      : `continue from ${stageLabels[stage]}`;
    void submitMessage(message, stage);
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

      <div className="grid min-h-[720px] grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.45fr)_minmax(320px,0.95fr)]">
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
          <WorkflowStageSidebar
            activeStage={activeStage}
            result={result}
            loading={loading}
            onSelect={selectStage}
            onRun={runStage}
          />
          <StageContent
            activeStage={activeStage}
            profile={profile}
            missingFields={result?.missingFields ?? []}
            result={result}
            activePlan={activePlan}
          />
        </main>

        <TracePanel trace={trace} />
      </div>
    </>
  );
}

function WorkflowStageSidebar({
  activeStage,
  result,
  loading,
  onSelect,
  onRun,
}: {
  activeStage: ViewStage;
  result: AgriSenseMessageResult | null;
  loading: boolean;
  onSelect: (stage: ViewStage) => void;
  onRun: (stage: ViewStage) => void;
}) {
  const available = new Set<ViewStage>(["intake", "trace", "full"]);
  if (result?.farmProfile) available.add("weather");
  if (result?.weather) available.add("evidence");
  if (result?.retrievedEvidence?.length) available.add("crop_ranking");
  if (result?.cropRankings?.length) {
    available.add("season_plan");
    available.add("financials");
  }
  if (result?.seasonPlan) {
    available.add("season_plan");
    available.add("financials");
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Workflow</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Jump to any module and continue from there.</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
          {stageLabels[activeStage]}
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {workflowStages.map((stage) => {
          const canRun = stage.id !== "trace" && (available.has(stage.id) || Boolean(result?.farmProfile && result.missingFields.length === 0));
          const active = activeStage === stage.id;
          return (
            <div
              key={stage.id}
              className={`rounded-lg border p-3 ${
                active
                  ? "border-brand-300 bg-brand-50/70 dark:border-brand-500/40 dark:bg-brand-500/[0.08]"
                  : "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(stage.id)}
                className="block w-full text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">{stage.label}</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{stage.tool}</span>
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{stage.description}</p>
              </button>
              <button
                type="button"
                onClick={() => onRun(stage.id)}
                disabled={loading || !canRun}
                className="mt-3 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
              >
                Run / Continue
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StageContent({
  activeStage,
  profile,
  missingFields,
  result,
  activePlan,
}: {
  activeStage: ViewStage;
  profile?: IntakeProfile;
  missingFields: string[];
  result: AgriSenseMessageResult | null;
  activePlan?: AgriSenseMessageResult["seasonPlan"];
}) {
  if (activeStage === "intake") return <ProfilePanel profile={profile} missingFields={missingFields} />;
  if (activeStage === "weather") return <WeatherPanel result={result} />;
  if (activeStage === "evidence") return <EvidencePanel result={result} />;
  if (activeStage === "crop_ranking") return <CropRankings rankings={result?.cropRankings ?? []} />;
  if (activeStage === "season_plan") return activePlan ? <SeasonPlanPanel plan={activePlan} /> : <EmptyStage title="Season Plan" text="Run crop ranking first, then continue into season planning." />;
  if (activeStage === "financials") return activePlan ? <FinancialPanel plan={activePlan} /> : <EmptyStage title="Financial Math" text="Run the season plan first to calculate costs, ROI, profit, and break-even." />;
  if (activeStage === "trace") return <EmptyStage title="Agent Trace" text="The trace inspector is open on the right side of this workspace." />;

  return (
    <>
      <ProfilePanel profile={profile} missingFields={missingFields} />
      <WeatherPanel result={result} />
      <EvidencePanel result={result} />
      <CropRankings rankings={result?.cropRankings ?? []} />
      {activePlan && (
        <>
          <SeasonPlanPanel plan={activePlan} />
          <FinancialPanel plan={activePlan} />
        </>
      )}
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

function EmptyStage({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{text}</p>
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
        <Metric label="Humidity" value={first?.humidityPct ? `${first.humidityPct}%` : "n/a"} />
        <Metric label="ET0" value={first?.referenceEvapotranspirationMm ? `${first.referenceEvapotranspirationMm} mm` : "n/a"} />
        <Metric label="Soil moisture" value={first?.soilMoisture0To9cm ? `${first.soilMoisture0To9cm}` : "n/a"} />
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{weather.locationText}</p>
    </section>
  );
}

function EvidencePanel({ result }: { result: AgriSenseMessageResult | null }) {
  const evidence = result?.retrievedEvidence ?? result?.seasonPlan?.retrievedEvidence ?? [];
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <SearchIcon width={18} height={18} />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Retrieved Evidence</h2>
      </div>
      {evidence.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          RAG evidence appears after intake and weather are complete.
        </p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {evidence.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{item.title}</p>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                  {item.source}
                </span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.content}</p>
              <p className="mt-2 truncate text-[11px] text-gray-400">{item.citation ?? item.id}</p>
            </div>
          ))}
        </div>
      )}
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
        <Metric label="Price/kg" value={formatMoney(plan.financials.pricePerKgBdt)} />
        <Metric label="Budget gap" value={formatMoney(plan.financials.budgetSurplusBdt)} />
        <Metric label="Trigger" value={plan.automationTrigger} />
      </div>
      <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Itemized costs</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{plan.selectedCropReason}</p>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {plan.financials.costBreakdown.map((item) => (
            <div key={item.category} className="flex items-start justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
              <div>
                <p className="text-xs font-medium text-gray-900 dark:text-white">{item.label}</p>
                <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{item.reasoning}</p>
              </div>
              <p className="shrink-0 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(item.amountBdt)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {plan.tasks.map((task) => (
          <TaskRow key={`${task.phase}-${task.startDate}`} task={task} />
        ))}
      </div>
    </section>
  );
}

function FinancialPanel({ plan }: { plan: NonNullable<AgriSenseMessageResult["seasonPlan"]> }) {
  const financials = plan.financials;
  const invariantOk =
    Math.round(financials.expectedRevenueBdt - financials.totalCostBdt) === Math.round(financials.netProfitBdt);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Financial Math</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            One computed source of truth for yield, revenue, cost, profit, ROI, and break-even.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            invariantOk ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600"
          }`}
        >
          {invariantOk ? "Math consistent" : "Check math"}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Expected yield" value={`${financials.expectedYieldKg} kg`} />
        <Metric label="Price/kg" value={formatMoney(financials.pricePerKgBdt)} />
        <Metric label="Revenue" value={formatMoney(financials.expectedRevenueBdt)} />
        <Metric label="Total cost" value={formatMoney(financials.totalCostBdt)} />
        <Metric label="Net profit" value={formatMoney(financials.netProfitBdt)} />
        <Metric label="ROI" value={`${financials.roiPct}%`} />
        <Metric label="Break-even yield" value={`${financials.breakEvenYieldKg} kg`} />
        <Metric label="Budget" value={formatMoney(financials.budgetBdt)} />
        <Metric label="Budget surplus" value={formatMoney(financials.budgetSurplusBdt)} />
      </div>
      <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-900 dark:text-white">Inspectable formula</p>
        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
          Revenue {formatMoney(financials.expectedRevenueBdt)} - cost {formatMoney(financials.totalCostBdt)} = net profit {formatMoney(financials.netProfitBdt)}.
          ROI = net profit / total cost x 100.
        </p>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {financials.costBreakdown.map((item) => (
          <div key={item.category} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
            <div>
              <p className="text-xs font-medium text-gray-900 dark:text-white">{item.label}</p>
              <p className="mt-1 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{item.reasoning}</p>
            </div>
            <p className="shrink-0 text-xs font-semibold text-gray-900 dark:text-white">{formatMoney(item.amountBdt)}</p>
          </div>
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

function normalizeStage(value: string | null): ViewStage {
  return workflowStages.some((stage) => stage.id === value) ? (value as ViewStage) : "full";
}
