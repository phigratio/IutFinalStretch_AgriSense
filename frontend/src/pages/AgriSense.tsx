import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import FarmWeatherMap from "../components/common/FarmWeatherMap.js";
import {
  getAgriSenseContext,
  getAgriSenseMemory,
  getAgriSenseWorkspace,
  sendAgriSenseMessage,
  simulateAgriSenseScenario,
  type AgriSenseWorkspace,
  type AgriSenseMessageResult,
  type ContextBundle,
  type CropRecommendation,
  type IntakeProfile,
  type MemoryOutcome,
  type MemorySessionSummary,
  type ScenarioDeltas,
  type ScenarioSimulationResult,
  type SeasonPlanTask,
  type TraceEvent,
  type WorkspaceFarmCard,
  type WorkspaceSuggestedAction,
  type WorkflowStage,
} from "../api/agrisense.js";
import { getOnboardingMe, type OnboardingProfile } from "../api/onboarding.js";
import { transcribeVoice } from "../api/voice.js";
import { diagnoseLeaf, type LeafDiagnosisResult } from "../api/vision.js";
import LeafResult from "../components/vision/LeafResult.js";
import { useAuth } from "../context/AuthContext.js";
import { ArrowUpIcon, BoxIcon, CalendarIcon, MicIcon, SearchIcon, StopIcon } from "../icons/index.js";

interface ChatMessage {
  role: "farmer" | "agent";
  text: string;
  diagnosis?: LeafDiagnosisResult;
}

type Language = "en" | "bn" | "banglish";
type ViewStage = WorkflowStage | "context" | "scheduler" | "scenario" | "trace";
type VoiceStatus = "idle" | "recording" | "transcribing";

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
  { id: "context", label: "Context", tool: "context.hydrate", description: "Fetch cached user memory, prior analyses, profile, and KB sources." },
  { id: "weather", label: "Weather", tool: "weather.fetch", description: "Refresh live weather for the farm location." },
  { id: "evidence", label: "Evidence", tool: "rag.retrieve", description: "Retrieve agronomic context for the profile and weather." },
  { id: "crop_ranking", label: "Crop Ranking", tool: "crop.rank", description: "Rank crops from profile, weather, budget, and evidence." },
  { id: "season_plan", label: "Season Plan", tool: "season.plan", description: "Generate dated farming actions for the selected crop." },
  { id: "scheduler", label: "Fertigation", tool: "fertigation.schedule", description: "Inspect FRG fertilizer splits, irrigation checkpoints, organic options, and costs." },
  { id: "financials", label: "Financial Projection", tool: "finance.calculate", description: "Inspect costs, profit, ROI, and break-even." },
  { id: "scenario", label: "Scenario", tool: "scenario.simulate", description: "Simulate rainfall, budget, price, cost, or yield shocks and compare changed numbers." },
  { id: "trace", label: "Agent Trace", tool: "trace.read", description: "Inspect every tool call, parameter, and raw response." },
  { id: "full", label: "Full Run", tool: "agent.plan", description: "Run the complete agent workflow end to end." },
];

const stageLabels = Object.fromEntries(workflowStages.map((stage) => [stage.id, stage.label])) as Record<ViewStage, string>;

const focusedStageMeta: Record<ViewStage, { title: string; subtitle: string; rubric: string; evidence: string; runLabel: string }> = {
  full: {
    title: "AgriSense Full",
    subtitle: "Complete agentic flow from conversational intake through weather, RAG, crop ranking, season plan, finance, memory, and trace.",
    rubric: "Tier 0 + advanced overview",
    evidence: "One place for the judge to run the end-to-end workflow and inspect every intermediate output.",
    runLabel: "Run full workflow",
  },
  intake: {
    title: "Conversational Intake",
    subtitle: "Collects only the missing farm facts: location, farm size, soil, water, budget, and target season.",
    rubric: "Criterion 1",
    evidence: "Shows required-field completion, follow-up state, saved profile, and prior intake history.",
    runLabel: "Continue intake",
  },
  context: {
    title: "Context & Memory",
    subtitle: "Hydrates cached farm profile, mem0 outcomes, prior sessions, and tenant/hub knowledge context.",
    rubric: "Persistent memory",
    evidence: "Shows what was remembered from older sessions before advice is generated.",
    runLabel: "Hydrate context",
  },
  weather: {
    title: "Live Weather Grounding",
    subtitle: "Uses the farm location to fetch real rainfall, temperature, humidity, ET0, and map context.",
    rubric: "Criterion 2",
    evidence: "Displays provider, returned weather values, map, and trace values used downstream.",
    runLabel: "Refresh weather",
  },
  evidence: {
    title: "RAG Evidence",
    subtitle: "Retrieves agronomic sources for crop, fertilizer, pest, weather, and season-plan advice.",
    rubric: "Criterion 7",
    evidence: "Shows citations and snippets so recommendations are grounded in KB retrieval.",
    runLabel: "Retrieve evidence",
  },
  crop_ranking: {
    title: "Crop Recommendation",
    subtitle: "Ranks at least three candidate crops with suitability, water need, risk, and profit estimates.",
    rubric: "Criterion 3",
    evidence: "Shows crop cards and comparison metrics from profile, weather, and retrieved evidence.",
    runLabel: "Rank crops",
  },
  season_plan: {
    title: "Season Plan",
    subtitle: "Builds a dated crop calendar from land preparation to harvest with inputs and checkpoints.",
    rubric: "Criterion 4",
    evidence: "Shows sowing, fertilizer, irrigation, weed, pest, and harvest windows with reasons.",
    runLabel: "Generate plan",
  },
  scheduler: {
    title: "Fertilizer & Irrigation Scheduler",
    subtitle: "Breaks down quantities, growth-stage timing, organic alternatives, weather warnings, and cost.",
    rubric: "Tier 1 scheduler",
    evidence: "Shows FRG-derived inputs, irrigation events, rain-delay warnings, and task-level costs.",
    runLabel: "Open scheduler",
  },
  financials: {
    title: "Financial Projection",
    subtitle: "Shows itemized costs, expected yield, revenue, net profit, ROI, and break-even math.",
    rubric: "Criterion 5",
    evidence: "Displays inspectable formulas and cost rows so changed inputs produce changed outputs.",
    runLabel: "Calculate finance",
  },
  scenario: {
    title: "Scenario Simulation",
    subtitle: "Recalculates the plan when rainfall, budget, price, cost, or yield assumptions change.",
    rubric: "Tier 1 scenario",
    evidence: "Shows baseline vs revised numbers, deltas, and scenario trace.",
    runLabel: "Simulate scenario",
  },
  trace: {
    title: "Visible Agent Trace",
    subtitle: "Exposes tool calls, parameters, latency, raw returns, and source IDs for audit.",
    rubric: "Criterion 8",
    evidence: "Lets a judge verify weather, RAG, finance, and plan numbers came from real calls.",
    runLabel: "Open trace",
  },
};

/** Map the profile the user filled during onboarding into the AgriSense intake shape. */
function mapOnboardingToIntake(o: OnboardingProfile): IntakeProfile {
  const location = [o.upazila, o.district].filter(Boolean).join(", ");
  return {
    locationText: location || o.district || undefined,
    // Onboarding stores farm size in decimals (শতক); 100 decimals = 1 acre.
    sizeAcres: o.farmSizeDecimals != null ? Math.round((o.farmSizeDecimals / 100) * 100) / 100 : undefined,
    soilType: o.soilTexture || undefined,
    waterAvailability: o.waterAvailability || undefined,
    budgetBdt: o.budgetBdt ?? undefined,
    targetSeason: o.targetSeason || undefined,
    farmerName: o.fullName || undefined,
    bdappsMobile: o.phone || undefined,
  };
}

/** Which of the six displayed intake fields are still empty. */
function missingIntakeFields(profile?: IntakeProfile): string[] {
  if (!profile) return ["Location", "Farm size", "Soil", "Water", "Budget", "Season"];
  const missing: string[] = [];
  if (!profile.locationText) missing.push("Location");
  if (profile.sizeAcres == null) missing.push("Farm size");
  if (!profile.soilType) missing.push("Soil");
  if (!profile.waterAvailability) missing.push("Water");
  if (profile.budgetBdt == null) missing.push("Budget");
  if (!profile.targetSeason) missing.push("Season");
  return missing;
}

/** A plain-language message describing the farm, used to run advice from the saved profile. */
function buildProfileMessage(profile: IntakeProfile): string {
  const parts = [
    profile.locationText ? `location ${profile.locationText}` : "",
    profile.sizeAcres != null ? `${profile.sizeAcres} acres` : "",
    profile.soilType ? `${profile.soilType} soil` : "",
    profile.waterAvailability ? `${profile.waterAvailability} water` : "",
    profile.budgetBdt != null ? `budget ${profile.budgetBdt} BDT` : "",
    profile.targetSeason ? `${profile.targetSeason} season` : "",
  ].filter(Boolean);
  return `My farm: ${parts.join(", ")}. Recommend the most profitable crop with a season plan and cost/profit breakdown.`;
}

export default function AgriSense() {
  const { user } = useAuth();
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
  const [useMemory, setUseMemory] = useState(true);
  const [rememberedOutcomes, setRememberedOutcomes] = useState<MemoryOutcome[]>([]);
  const [memorySessions, setMemorySessions] = useState<MemorySessionSummary[]>([]);
  const [contextBundle, setContextBundle] = useState<ContextBundle | null>(null);
  const [workspace, setWorkspace] = useState<AgriSenseWorkspace | null>(null);
  const [selectedWorkspaceFarmId, setSelectedWorkspaceFarmId] = useState<string | undefined>();
  const [scenarioResult, setScenarioResult] = useState<ScenarioSimulationResult | null>(null);
  const [ignoredOutcomeIds, setIgnoredOutcomeIds] = useState<string[]>([]);
  const [geoPoint, setGeoPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onboardingProfile, setOnboardingProfile] = useState<IntakeProfile | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const leafInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | undefined>(undefined);

  const activeStage = normalizeStage(searchParams.get("stage"));
  const workspaceResult = useMemo(
    () => resultFromWorkspace(workspace, selectedWorkspaceFarmId, activeStage),
    [workspace, selectedWorkspaceFarmId, activeStage],
  );
  const renderedResult = result ?? workspaceResult;
  const activePlan = renderedResult?.seasonPlan;
  // Fall back to the farm the user already filled during onboarding so the
  // profile panel is pre-populated instead of showing everything as "Missing".
  const profile = renderedResult?.farmProfile ?? onboardingProfile ?? undefined;
  const displayMissingFields = renderedResult?.missingFields ?? missingIntakeFields(profile);

  useEffect(() => {
    let cancelled = false;
    getOnboardingMe()
      .then((me) => {
        if (cancelled || me.role !== "user" || !me.onboarding) return;
        setOnboardingProfile(mapOnboardingToIntake(me.onboarding));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the last completed plan so context (weather, crops, plan, finance)
  // survives a page reload and downstream modules like scenario keep working.
  useEffect(() => {
    const raw = localStorage.getItem("agrisense.latestPlan");
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as AgriSenseMessageResult;
      if (stored?.seasonPlan) setResult(stored);
    } catch {
      localStorage.removeItem("agrisense.latestPlan");
    }
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("agrisense.sessionContext");
    if (!raw) return;
    try {
      const stored = JSON.parse(raw) as { sessionId?: string; farmerId?: string; farmId?: string; language?: Language };
      setSessionId(stored.sessionId);
      setFarmerId(stored.farmerId);
      setFarmId(stored.farmId);
      if (stored.language) setLanguage(stored.language);
    } catch {
      localStorage.removeItem("agrisense.sessionContext");
    }
  }, []);

  useEffect(() => {
    if (!sessionId && !farmerId && !farmId) return;
    localStorage.setItem("agrisense.sessionContext", JSON.stringify({ sessionId, farmerId, farmId, language }));
  }, [sessionId, farmerId, farmId, language]);

  useEffect(() => {
    let cancelled = false;
    getAgriSenseWorkspace({ userId: user?.id, farmerId, farmId, sessionId, limit: 8 })
      .then((nextWorkspace) => {
        if (cancelled) return;
        setWorkspace(nextWorkspace);
        const preferredFarmId = chooseWorkspaceFarmId(nextWorkspace, activeStage, selectedWorkspaceFarmId ?? farmId);
        setSelectedWorkspaceFarmId(preferredFarmId);
        if (!farmerId && !farmId && !sessionId && preferredFarmId) {
          const first = nextWorkspace.farmCards.find((card) => card.farmId === preferredFarmId);
          if (!first) return;
          setFarmerId(first.farmerId);
          setFarmId(first.farmId);
          setSessionId(first.sessionId);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkspace(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, farmerId, farmId, sessionId, activeStage, selectedWorkspaceFarmId]);

  useEffect(() => {
    if (!useMemory) return;
    if (!user?.id && !farmerId && !farmId) return;
    let cancelled = false;
    Promise.all([
      getAgriSenseMemory({ userId: user?.id, farmerId, farmId, limit: 8 }),
      getAgriSenseContext({ userId: user?.id, farmerId, farmId, sessionId, language, limit: 8 }),
    ])
      .then(([memory, context]) => {
        if (cancelled) return;
        setRememberedOutcomes(memory.outcomes.filter((outcome) => !ignoredOutcomeIds.includes(outcome.id)));
        setMemorySessions(memory.sessions);
        setContextBundle(context);
      })
      .catch(() => {
        if (!cancelled) {
          setRememberedOutcomes([]);
          setMemorySessions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, farmerId, farmId, sessionId, language, useMemory, ignoredOutcomeIds]);

  useEffect(() => {
    return () => {
      if (recordingTimeoutRef.current) window.clearTimeout(recordingTimeoutRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function submitMessage(
    messageText = input,
    workflowStage: WorkflowStage = activeStage === "trace" || activeStage === "context" || activeStage === "scheduler" || activeStage === "scenario" ? "full" : activeStage,
    acceptedOutcomeIds?: string[],
    overrides: { sessionId?: string; farmerId?: string; farmId?: string } = {},
  ) {
    const text = messageText.trim();
    if (!text || loading) return;

    setInput("");
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "farmer", text }]);

    try {
      const response = await sendAgriSenseMessage({
        message: text,
        sessionId: overrides.sessionId ?? sessionId,
        farmerId: overrides.farmerId ?? farmerId,
        farmId: overrides.farmId ?? farmId,
        userId: user?.id,
        preferredLanguage: language,
        useMemory,
        acceptedOutcomeIds,
        ignoredOutcomeIds,
        workflowStage,
        triggerReason: workflowStage === "weather" ? "weather_refreshed" : workflowStage === "full" ? "user_requested_replan" : undefined,
        latitude: geoPoint?.latitude,
        longitude: geoPoint?.longitude,
      });

      setSessionId(response.sessionId);
      setFarmerId(response.farmerId);
      setFarmId(response.farmId);
      setResult(response);
      setSelectedWorkspaceFarmId(response.farmId);
      if (response.context) {
        setContextBundle(response.context);
      }
      if (response.rememberedOutcomes) {
        setRememberedOutcomes(response.rememberedOutcomes.filter((outcome) => !ignoredOutcomeIds.includes(outcome.id)));
      }
      if (response.seasonPlan) {
        localStorage.setItem("agrisense.latestPlan", JSON.stringify(response));
      }
      getAgriSenseWorkspace({ userId: user?.id, farmerId: response.farmerId, farmId: response.farmId, sessionId: response.sessionId, limit: 8 })
        .then(setWorkspace)
        .catch(() => undefined);
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

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      setError("Device geolocation is not available in this browser.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => setGeoPoint({
        latitude: roundCoord(position.coords.latitude),
        longitude: roundCoord(position.coords.longitude),
      }),
      (err) => setError(err.message || "Could not read device location."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  }

  async function startVoiceRecording() {
    if (voiceStatus !== "idle" || loading) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser.");
      return;
    }

    setError(null);
    setVoiceTranscript(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("Voice recording failed. Please try again or type the message.");
        setVoiceStatus("idle");
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.onstop = () => {
        if (recordingTimeoutRef.current) {
          window.clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = undefined;
        }
        stream.getTracks().forEach((track) => track.stop());
        void transcribeRecordedAudio();
      };

      recorder.start();
      setVoiceStatus("recording");
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone permission was denied.");
      setVoiceStatus("idle");
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }

  async function transcribeRecordedAudio() {
    const audio = new Blob(audioChunksRef.current, { type: "audio/webm" });
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;
    if (!audio.size) {
      setVoiceStatus("idle");
      setError("No voice audio was recorded.");
      return;
    }

    setVoiceStatus("transcribing");
    try {
      const response = await transcribeVoice({
        audio,
        language,
        sessionId,
        farmerId,
        farmId,
      });
      setInput(response.transcript);
      setVoiceTranscript(response.transcript);
      setTrace((current) => [...current, ...response.trace]);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice transcription failed.");
    } finally {
      setVoiceStatus("idle");
    }
  }

  async function diagnoseLeafPhoto(file: File) {
    if (loading) return;
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "farmer", text: "🍃 Sent a leaf photo for diagnosis." }]);
    try {
      const diagnosis = await diagnoseLeaf({
        file,
        farmId,
        sessionId,
        crop: result?.seasonPlan?.crop,
        locationText: profile?.locationText,
        areaAcres: profile?.sizeAcres,
        language,
      });
      setTrace((current) => [...current, ...diagnosis.trace]);
      const summary = diagnosis.healthy
        ? `No disease detected (${Math.round(diagnosis.confidence * 100)}% confidence). Keep monitoring the crop.`
        : `${diagnosis.disease} on ${diagnosis.crop} — ${Math.round(diagnosis.confidence * 100)}% confidence, ${diagnosis.severity} severity.`;
      setMessages((current) => [...current, { role: "agent", text: summary, diagnosis }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Leaf diagnosis failed.";
      setError(message);
      setMessages((current) => [...current, { role: "agent", text: message }]);
    } finally {
      setLoading(false);
    }
  }

  function selectStage(stage: ViewStage) {
    setSearchParams(stage === "full" ? {} : { stage });
  }

  function runStage(stage: ViewStage) {
    selectStage(stage);
    if (stage === "trace" || stage === "context" || stage === "scheduler" || stage === "scenario") return;
    const message = stage === "intake"
      ? "continue intake"
      : `continue from ${stageLabels[stage]}`;
    void submitMessage(message, stage);
  }

  function selectWorkspaceFarm(card: WorkspaceFarmCard) {
    setSelectedWorkspaceFarmId(card.farmId);
    setSessionId(card.sessionId);
    setFarmerId(card.farmerId);
    setFarmId(card.farmId);
    setResult(null);
    setMessages((current) => current.length <= 1 ? current : [
      ...current,
      { role: "agent", text: `Loaded saved farm: ${profileSummary(card.profile)}.` },
    ]);
  }

  function runWorkspaceAction(action: WorkspaceSuggestedAction) {
    if (action.farmId) setSelectedWorkspaceFarmId(action.farmId);
    setSessionId(action.sessionId);
    setFarmerId(action.farmerId);
    setFarmId(action.farmId);
    const stage = action.workflowStage ?? "full";
    const message = action.id === "complete_intake"
      ? "continue intake"
      : `continue from ${stageLabels[stage] ?? "Full Run"}`;
    void submitMessage(message, stage, undefined, {
      sessionId: action.sessionId,
      farmerId: action.farmerId,
      farmId: action.farmId,
    });
  }

  function ignoreOutcome(id: string) {
    setIgnoredOutcomeIds((current) => current.includes(id) ? current : [...current, id]);
    setRememberedOutcomes((current) => current.filter((outcome) => outcome.id !== id));
  }

  function useOutcome(outcome: MemoryOutcome) {
    const workflowStage: WorkflowStage = activeStage === "trace" || activeStage === "context" || activeStage === "scheduler" || activeStage === "scenario" ? "full" : activeStage;
    void submitMessage(
      `Use remembered context: ${outcome.title}`,
      workflowStage,
      [outcome.id],
    );
  }

  async function runScenario(message: string, deltas?: ScenarioDeltas) {
    // Use the currently displayed plan (a fresh run, a restored plan, or one
    // loaded from a saved farm) — not only the live `result` — so scenario works
    // after a reload or when navigating straight to this module.
    const baseline = renderedResult;
    if (!baseline?.weather || !baseline.cropRankings?.length || !baseline.seasonPlan) {
      setError("Run a complete AgriSense plan before scenario simulation.");
      return;
    }
    setError(null);
    setLoading(true);
    setMessages((current) => [...current, { role: "farmer", text: message }]);
    try {
      const simulation = await simulateAgriSenseScenario({
        sessionId,
        farmerId,
        farmId,
        userId: user?.id,
        preferredLanguage: language,
        selectedCrop: baseline.seasonPlan.crop,
        message,
        deltas,
        baseline,
      });
      setScenarioResult(simulation);
      setTrace((current) => [...current, ...simulation.trace]);
      setMessages((current) => [...current, { role: "agent", text: simulation.recommendation }]);
      selectStage("scenario");
    } catch (err) {
      const text = err instanceof Error ? err.message : "Scenario simulation failed";
      setError(text);
      setMessages((current) => [...current, { role: "agent", text }]);
    } finally {
      setLoading(false);
    }
  }

  const isFullStage = activeStage === "full";
  const stageMeta = focusedStageMeta[activeStage];
  const canRunFocusedStage = activeStage !== "trace" && activeStage !== "context" && activeStage !== "scheduler" && activeStage !== "scenario";
  // Farmers get a clean chat + results view. The full judge-facing workspace
  // (rubric strip, workflow grid, memory/trace/workspace panels) is opt-in via
  // ?advanced=1 so it stays available without overwhelming the end user.
  const advanced = searchParams.get("advanced") === "1";

  // Chat conversation + composer, shared by the inline column (advanced) and the
  // floating modal (farmer view).
  const chatMessages = (
    <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
      {messages.map((message, index) => (
        <div key={`${message.role}-${index}`} className={`flex flex-col ${message.role === "farmer" ? "items-end" : "items-start"}`}>
          <div
            className={`max-w-[92%] rounded-lg px-3 py-2 text-sm leading-6 ${
              message.role === "farmer"
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-gray-100"
            }`}
          >
            {message.text}
          </div>
          {message.diagnosis && (
            <div className="mt-2 w-full rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-white/[0.03]">
              <LeafResult result={message.diagnosis} />
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const chatForm = (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 dark:border-gray-800">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={language === "bn" ? "খামারের তথ্য লিখুন..." : language === "banglish" ? "Farm er details likhun..." : "Describe the farm..."}
          className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100"
        />
        <input
          ref={leafInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (selected) void diagnoseLeafPhoto(selected);
          }}
        />
        <button
          type="button"
          disabled={loading || voiceStatus !== "idle"}
          onClick={() => leafInputRef.current?.click()}
          aria-label="Diagnose a leaf photo"
          title="Diagnose a leaf photo"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-lg hover:bg-white disabled:opacity-60 dark:border-gray-800 dark:bg-white/[0.03]"
        >
          🍃
        </button>
        <button
          type="button"
          disabled={loading || voiceStatus === "transcribing"}
          onClick={voiceStatus === "recording" ? stopVoiceRecording : () => void startVoiceRecording()}
          aria-label={voiceStatus === "recording" ? "Stop recording" : "Record voice"}
          title={voiceStatus === "recording" ? "Stop recording" : "Record voice"}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border disabled:opacity-60 ${
            voiceStatus === "recording"
              ? "border-error-500 bg-error-50 text-error-600 dark:bg-error-500/10"
              : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-white dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100"
          }`}
        >
          {voiceStatus === "recording" ? <StopIcon width={18} height={18} /> : <MicIcon width={18} height={18} />}
        </button>
        <button
          type="submit"
          disabled={loading || voiceStatus === "recording" || voiceStatus === "transcribing"}
          aria-label="Send message"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <ArrowUpIcon width={18} height={18} />
        </button>
      </div>
      <div className="mt-2 min-h-5 text-xs text-gray-500 dark:text-gray-400">
        {voiceStatus === "recording" && "Recording voice... stop when done. Max 60 seconds."}
        {voiceStatus === "transcribing" && "Transcribing with OpenAI Whisper..."}
        {voiceStatus === "idle" && voiceTranscript && `Transcript ready: ${voiceTranscript}`}
      </div>
    </form>
  );

  return (
    <>
      <PageMeta
        title={`${stageMeta.title} · ICT Fest`}
        description={stageMeta.subtitle}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            {stageMeta.title}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {stageMeta.subtitle}
          </p>
        </div>
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
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      {/* Use the farm the user already filled during onboarding — one click to advice. */}
      {messages.length <= 1 && onboardingProfile && (
        <button
          type="button"
          onClick={() => void submitMessage(buildProfileMessage(onboardingProfile))}
          disabled={loading}
          className="mb-4 w-full rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "..." : `🌱 Get advice for my farm${onboardingProfile.locationText ? ` (${onboardingProfile.locationText})` : ""}`}
        </button>
      )}

      {/* Quick examples — shown only before the first question so they don't clutter. */}
      {messages.length <= 1 && !onboardingProfile && (
        <div className="mb-4 flex flex-wrap gap-2">
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
          <button
            type="button"
            onClick={useDeviceLocation}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
          >
            {geoPoint ? `GPS ${geoPoint.latitude.toFixed(3)}, ${geoPoint.longitude.toFixed(3)}` : "Use Device GPS"}
          </button>
        </div>
      )}

      {/* Judge-facing workspace — opt-in via ?advanced=1, hidden from farmers. */}
      {advanced && (isFullStage ? (
        <>
          <RubricCoverageStrip />
          <WorkspaceResumePanel
            activeStage={activeStage}
            workspace={workspace}
            selectedFarmId={selectedWorkspaceFarmId}
            onSelectFarm={selectWorkspaceFarm}
            onRunAction={runWorkspaceAction}
          />

          <MemoryPanel
            useMemory={useMemory}
            outcomes={rememberedOutcomes}
            sessions={memorySessions}
            onToggle={setUseMemory}
            onUse={useOutcome}
            onIgnore={ignoreOutcome}
            onViewTrace={() => selectStage("trace")}
          />
        </>
      ) : (
        <FocusedStageHero
          activeStage={activeStage}
          meta={stageMeta}
          profile={profile}
          result={renderedResult}
          traceCount={trace.length}
          onRun={() => {
            if (canRunFocusedStage) runStage(activeStage);
            else if (activeStage === "scenario") selectStage("scenario");
            else if (activeStage === "trace") selectStage("trace");
          }}
          loading={loading}
        />
      ))}

      {/* Simple run bar for a single module in the farmer view. */}
      {!advanced && !isFullStage && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{stageMeta.title}</p>
          <button
            type="button"
            onClick={() => {
              if (canRunFocusedStage) runStage(activeStage);
              else if (activeStage === "scenario") selectStage("scenario");
              else if (activeStage === "trace") selectStage("trace");
            }}
            disabled={loading || activeStage === "trace" || activeStage === "context" || activeStage === "scheduler"}
            className="h-10 shrink-0 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running..." : stageMeta.runLabel}
          </button>
        </div>
      )}

      <div className={`grid min-h-[560px] grid-cols-1 gap-4 ${advanced ? "xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.45fr)_minmax(320px,0.95fr)]" : "grid-cols-1"}`}>
        {advanced && (
          <section className="flex min-h-[560px] flex-col rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ask AgriSense</h2>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Type, talk, or send a leaf photo.</p>
            </div>
            {chatMessages}
            {chatForm}
          </section>
        )}

        <main className="space-y-4">
          {advanced && isFullStage && (
            <WorkflowStageSidebar
              activeStage={activeStage}
              result={renderedResult}
              loading={loading}
              onSelect={selectStage}
              onRun={runStage}
            />
          )}
          <StageContent
            activeStage={activeStage}
            profile={profile}
            missingFields={displayMissingFields}
            result={renderedResult}
            activePlan={activePlan}
            context={contextBundle ?? renderedResult?.context}
            scenarioResult={scenarioResult}
            loading={loading}
            onSimulateScenario={runScenario}
          />
        </main>

        {advanced && (
          <aside className="space-y-4">
            {!isFullStage && (
              <FocusedStageControlPanel
                activeStage={activeStage}
                meta={stageMeta}
                profile={profile}
                workspace={workspace}
                selectedFarmId={selectedWorkspaceFarmId}
                useMemory={useMemory}
                outcomes={rememberedOutcomes}
                onToggleMemory={setUseMemory}
                onUseMemory={useOutcome}
                onRun={() => {
                  if (canRunFocusedStage) runStage(activeStage);
                }}
                loading={loading}
              />
            )}
            <TracePanel trace={trace} />
          </aside>
        )}
      </div>

      {/* Farmer view: chat lives in a floating button + modal so results get full width. */}
      {!advanced && (
        <>
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label="Ask AgriSense"
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-2xl text-white shadow-lg transition hover:bg-brand-600"
          >
            💬
            {loading && <span className="absolute right-1 top-1 h-3 w-3 animate-ping rounded-full bg-white" />}
          </button>

          {chatOpen && (
            <div className="fixed inset-0 z-50 flex items-stretch justify-end sm:items-end sm:p-6" role="dialog" aria-modal="true" aria-label="Ask AgriSense">
              <button type="button" aria-label="Close chat" className="absolute inset-0 h-full w-full cursor-default bg-black/40" onClick={() => setChatOpen(false)} />
              <div className="relative flex h-full w-full flex-col border border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900 sm:h-[600px] sm:max-h-[85vh] sm:w-[420px] sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Ask AgriSense</h2>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Type, talk, or send a leaf photo.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChatOpen(false)}
                    aria-label="Close"
                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05]"
                  >
                    ✕
                  </button>
                </div>
                {chatMessages}
                {chatForm}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

function RubricCoverageStrip() {
  const items = [
    "Conversational intake",
    "Live weather",
    "Crop ranking",
    "Season plan",
    "Financial projection",
    "RAG evidence",
    "Visible trace",
    "Persistent memory",
    "Proactive advice",
    "Pest risk",
    "Marketplace",
    "BDApps payment",
  ];

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Hackathon Criteria Coverage</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Each sidebar page maps to a rubric item and keeps backend evidence visible.
          </p>
        </div>
        <span className="rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-400">
          Tier 0 + Tier 1 + selected Tier 2
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200">
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

function FocusedStageHero({
  activeStage,
  meta,
  profile,
  result,
  traceCount,
  onRun,
  loading,
}: {
  activeStage: ViewStage;
  meta: { title: string; subtitle: string; rubric: string; evidence: string; runLabel: string };
  profile?: IntakeProfile;
  result: AgriSenseMessageResult | null;
  traceCount: number;
  onRun: () => void;
  loading: boolean;
}) {
  const readiness = stageReadiness(activeStage, result);
  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
              {meta.rubric}
            </span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${readiness.ready ? successPillClass : warningPillClass}`}>
              {readiness.label}
            </span>
          </div>
          <h2 className="mt-3 text-xl font-semibold text-gray-900 dark:text-white">{meta.title}</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-600 dark:text-gray-300">{meta.evidence}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Farm" value={profile ? profileSummary(profile) : "No profile selected"} />
            <Metric label="Session" value={result?.sessionId ? shortId(result.sessionId) : "new"} />
            <Metric label="Trace events" value={traceCount} />
            <Metric label="Stage" value={stageLabels[activeStage]} />
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Backend connection</p>
          <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{meta.subtitle}</p>
          <button
            type="button"
            onClick={onRun}
            disabled={loading || activeStage === "trace" || activeStage === "context" || activeStage === "scheduler"}
            className="mt-4 h-10 w-full rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Running..." : meta.runLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function FocusedStageControlPanel({
  activeStage,
  meta,
  profile,
  workspace,
  selectedFarmId,
  useMemory,
  outcomes,
  onToggleMemory,
  onUseMemory,
  onRun,
  loading,
}: {
  activeStage: ViewStage;
  meta: { title: string; subtitle: string; rubric: string; evidence: string; runLabel: string };
  profile?: IntakeProfile;
  workspace: AgriSenseWorkspace | null;
  selectedFarmId?: string;
  useMemory: boolean;
  outcomes: MemoryOutcome[];
  onToggleMemory: (enabled: boolean) => void;
  onUseMemory: (outcome: MemoryOutcome) => void;
  onRun: () => void;
  loading: boolean;
}) {
  const selectedFarm = workspace?.farmCards.find((card) => card.farmId === selectedFarmId) ?? workspace?.farmCards[0];
  const visibleOutcomes = outcomes.slice(0, 3);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Module Controls</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{meta.rubric}</p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
          {stageLabels[activeStage]}
        </span>
      </div>
      <button
        type="button"
        onClick={onRun}
        disabled={loading || activeStage === "trace" || activeStage === "context" || activeStage === "scheduler" || activeStage === "scenario"}
        className="mt-4 h-10 w-full rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-gray-900"
      >
        {loading ? "Running..." : meta.runLabel}
      </button>

      <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <p className="text-xs font-semibold text-gray-900 dark:text-white">Farm Context</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Metric label="Location" value={profile?.locationText ?? selectedFarm?.profile.locationText ?? "n/a"} />
          <Metric label="Size" value={profile?.sizeAcres ? `${profile.sizeAcres} acres` : selectedFarm?.profile.sizeAcres ? `${selectedFarm.profile.sizeAcres} acres` : "n/a"} />
          <Metric label="Soil" value={profile?.soilType ?? selectedFarm?.profile.soilType ?? "n/a"} />
          <Metric label="Season" value={profile?.targetSeason ?? selectedFarm?.profile.targetSeason ?? "n/a"} />
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          checked={useMemory}
          onChange={(event) => onToggleMemory(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
        />
        Use previous sessions
      </label>

      <div className="mt-4 space-y-2">
        <p className="text-xs font-semibold text-gray-900 dark:text-white">Remembered Outcomes</p>
        {visibleOutcomes.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">No matching memory outcomes loaded.</p>
        ) : (
          visibleOutcomes.map((outcome) => (
            <button
              key={outcome.id}
              type="button"
              onClick={() => onUseMemory(outcome)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-white/[0.04]"
            >
              <span className="block font-semibold text-gray-900 dark:text-white">{outcome.title}</span>
              <span className="mt-1 line-clamp-2 block leading-5 text-gray-500 dark:text-gray-400">{outcome.summary}</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function stageReadiness(stage: ViewStage, result: AgriSenseMessageResult | null): { ready: boolean; label: string } {
  if (stage === "full") return { ready: Boolean(result?.seasonPlan), label: result?.seasonPlan ? "Complete run ready" : "Run needed" };
  if (stage === "intake") return { ready: Boolean(result?.farmProfile && result.missingFields.length === 0), label: result?.farmProfile ? "Profile loaded" : "Needs intake" };
  if (stage === "weather") return { ready: Boolean(result?.weather), label: result?.weather ? "Weather loaded" : "Needs weather" };
  if (stage === "evidence" || stage === "context") return { ready: Boolean(result?.retrievedEvidence?.length || result?.context), label: "Evidence check" };
  if (stage === "crop_ranking") return { ready: Boolean(result?.cropRankings?.length), label: result?.cropRankings?.length ? `${result.cropRankings.length} crops` : "Needs ranking" };
  if (stage === "season_plan" || stage === "scheduler" || stage === "financials" || stage === "scenario") return { ready: Boolean(result?.seasonPlan), label: result?.seasonPlan ? "Plan loaded" : "Needs plan" };
  return { ready: true, label: "Trace view" };
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
  if (result?.context) available.add("context");
  if (result?.weather) available.add("evidence");
  if (result?.retrievedEvidence?.length) available.add("crop_ranking");
  if (result?.cropRankings?.length) {
    available.add("season_plan");
    available.add("financials");
  }

  if (result?.seasonPlan) {
    available.add("season_plan");
    available.add("scheduler");
    available.add("financials");
    available.add("scenario");
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

function WorkspaceResumePanel({
  activeStage,
  workspace,
  selectedFarmId,
  onSelectFarm,
  onRunAction,
}: {
  activeStage: ViewStage;
  workspace: AgriSenseWorkspace | null;
  selectedFarmId?: string;
  onSelectFarm: (card: WorkspaceFarmCard) => void;
  onRunAction: (action: WorkspaceSuggestedAction) => void;
}) {
  const selectedFarm = workspace?.farmCards.find((card) => card.farmId === selectedFarmId) ?? workspace?.farmCards[0];
  const selectedWeather = selectedFarm ? workspace?.weatherCards.find((card) => card.farmId === selectedFarm.farmId) : undefined;
  const selectedEvidence = selectedFarm
    ? workspace?.evidenceCards.find((card) => card.farmId === selectedFarm.farmId || card.sessionId === selectedFarm.sessionId)
    : undefined;
  const actions = selectedFarm ? actionsForFarm(selectedFarm, Boolean(selectedWeather), Boolean(selectedEvidence)) : [];
  const focusedActions = activeStage === "weather"
    ? actions.filter((action) => action.workflowStage === "weather" || action.workflowStage === "intake")
    : activeStage === "evidence"
      ? actions.filter((action) => action.workflowStage === "evidence" || action.workflowStage === "weather" || action.workflowStage === "intake")
      : actions;

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Resume From Saved Farm Data</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Pick a previous farm/session, then run only the current module instead of restarting the full workflow.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
          {workspace ? `${workspace.farmCards.length} farm${workspace.farmCards.length === 1 ? "" : "s"}` : "Loading"}
        </span>
      </div>

      {!workspace || workspace.farmCards.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No saved farm profile found yet. Use the intake chat once, then weather and evidence can resume from here.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 xl:grid-cols-3">
            {workspace.farmCards.slice(0, 6).map((card) => (
              <button
                key={card.farmId}
                type="button"
                onClick={() => onSelectFarm(card)}
                className={`rounded-lg border p-3 text-left transition ${
                  card.farmId === selectedFarm?.farmId
                    ? "border-brand-300 bg-brand-50/80 dark:border-brand-500/40 dark:bg-brand-500/[0.08]"
                    : "border-gray-200 bg-gray-50 hover:bg-white dark:border-gray-800 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{profileSummary(card.profile)}</p>
                  <span className={card.completion === "complete" ? successPillClass : warningPillClass}>
                    {card.completion}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {card.missingFields.length === 0 ? "Ready for weather and evidence." : `Missing ${card.missingFields.join(", ")}.`}
                </p>
                <p className="mt-2 text-[11px] text-gray-400">Updated {new Date(card.updatedAt).toLocaleString()} · {card.sessionId ? shortId(card.sessionId) : "no session"}</p>
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(260px,0.75fr)]">
            <ResumeInfoCard
              title="Latest Weather"
              value={selectedWeather ? `${selectedWeather.rain7dMm} mm rain / 7d` : "Not fetched yet"}
              detail={selectedWeather ? `${selectedWeather.weather.locationText} · ${new Date(selectedWeather.refreshedAt).toLocaleString()}` : "Run weather for the selected farm."}
            />
            <ResumeInfoCard
              title="Latest Evidence"
              value={selectedEvidence ? `${selectedEvidence.count} source item(s)` : "Not retrieved yet"}
              detail={selectedEvidence ? `Last retrieval ${new Date(selectedEvidence.retrievedAt).toLocaleString()}` : "Run evidence after profile and weather are ready."}
            />
            <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">Suggested Action</p>
              <div className="mt-3 space-y-2">
                {focusedActions.slice(0, 3).map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => onRunAction(action)}
                    className="w-full rounded-lg bg-brand-500 px-3 py-2 text-left text-xs font-semibold text-white hover:bg-brand-600"
                  >
                    {action.label}
                    <span className="mt-1 block font-normal opacity-85">{action.reason}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ResumeInfoCard({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{value}</p>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function MemoryPanel({
  useMemory,
  outcomes,
  sessions,
  onToggle,
  onUse,
  onIgnore,
  onViewTrace,
}: {
  useMemory: boolean;
  outcomes: MemoryOutcome[];
  sessions: MemorySessionSummary[];
  onToggle: (enabled: boolean) => void;
  onUse: (outcome: MemoryOutcome) => void;
  onIgnore: (id: string) => void;
  onViewTrace: () => void;
}) {
  const visibleOutcomes = outcomes.slice(0, 5);

  return (
    <section className="mb-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Remembered From Previous Sessions</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Ranked farm facts, prior decisions, financial results, risks, and pending tasks.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200">
          <input
            type="checkbox"
            checked={useMemory}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
          />
          Use previous sessions
        </label>
      </div>

      {!useMemory ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">Memory recall is off for this session.</p>
      ) : visibleOutcomes.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">No previous outcomes found yet.</p>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-5">
          {visibleOutcomes.map((outcome) => (
            <div key={outcome.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{outcome.title}</p>
                  <p className="mt-1 text-[11px] capitalize text-gray-500 dark:text-gray-400">
                    {outcome.kind.replace("_", " ")} · {Math.round(outcome.score)}
                  </p>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{outcome.summary}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => onUse(outcome)}
                  className="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-600"
                >
                  Use
                </button>
                <button
                  type="button"
                  onClick={() => onIgnore(outcome.id)}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                >
                  Ignore
                </button>
                <button
                  type="button"
                  onClick={onViewTrace}
                  className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-white/[0.06]"
                >
                  Source
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {useMemory && sessions.length > 0 && (
        <div className="mt-4 border-t border-gray-200 pt-3 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Session History</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {sessions.slice(0, 4).map((session) => (
              <div key={session.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">{shortId(session.id)}</p>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">{session.status}</span>
                </div>
                <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
                  {session.selectedCrop ?? session.channel} · {formatDate(session.updatedAt.slice(0, 10))}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StageContent({
  activeStage,
  profile,
  missingFields,
  result,
  activePlan,
  context,
  scenarioResult,
  loading,
  onSimulateScenario,
}: {
  activeStage: ViewStage;
  profile?: IntakeProfile;
  missingFields: string[];
  result: AgriSenseMessageResult | null;
  activePlan?: AgriSenseMessageResult["seasonPlan"];
  context?: ContextBundle | null;
  scenarioResult: ScenarioSimulationResult | null;
  loading: boolean;
  onSimulateScenario: (message: string, deltas?: ScenarioDeltas) => void;
}) {
  if (activeStage === "intake") return <ProfilePanel profile={profile} missingFields={missingFields} />;
  if (activeStage === "context") return <ContextPanel context={context ?? result?.context ?? null} />;
  if (activeStage === "weather") return <WeatherPanel result={result} />;
  if (activeStage === "evidence") return <EvidencePanel result={result} />;
  if (activeStage === "crop_ranking") return <CropRankings rankings={result?.cropRankings ?? []} />;
  if (activeStage === "season_plan") return activePlan ? <SeasonPlanPanel plan={activePlan} /> : <EmptyStage title="Season Plan" text="Run crop ranking first, then continue into season planning." />;
  if (activeStage === "scheduler") return activePlan ? <FertigationPanel plan={activePlan} /> : <EmptyStage title="Fertigation" text="Run the season plan first to inspect fertilizer and irrigation scheduling." />;
  if (activeStage === "financials") return activePlan ? <FinancialPanel plan={activePlan} /> : <EmptyStage title="Financial Projection" text="Run the season plan first to calculate costs, ROI, profit, and break-even." />;
  if (activeStage === "scenario") return <ScenarioPanel result={scenarioResult} baselineReady={Boolean(activePlan)} loading={loading} onSimulate={onSimulateScenario} />;
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
          <FertigationPanel plan={activePlan} />
          <FinancialPanel plan={activePlan} />
          <ScenarioPanel result={scenarioResult} baselineReady={Boolean(activePlan)} loading={loading} onSimulate={onSimulateScenario} />
        </>
      )}
    </>
  );
}

function ScenarioPanel({
  result,
  baselineReady,
  loading,
  onSimulate,
}: {
  result: ScenarioSimulationResult | null;
  baselineReady: boolean;
  loading: boolean;
  onSimulate: (message: string, deltas?: ScenarioDeltas) => void;
}) {
  const [scenarioText, setScenarioText] = useState("What if rainfall drops 30%?");
  const quickScenarios: Array<{ label: string; message: string; deltas: ScenarioDeltas }> = [
    { label: "Rainfall -30%", message: "What if rainfall drops 30%?", deltas: { rainfallPct: -30 } },
    { label: "Budget -40%", message: "What if my budget is cut 40%?", deltas: { budgetPct: -40 } },
    { label: "Price -20%", message: "What if market price falls 20%?", deltas: { pricePct: -20 } },
    { label: "Cost +15%", message: "What if input cost increases 15%?", deltas: { costPct: 15 } },
  ];

  function submit(event: FormEvent) {
    event.preventDefault();
    onSimulate(scenarioText);
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Scenario Simulation</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Recalculate the Bangladesh season plan when rainfall, budget, price, input cost, or yield changes.
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${baselineReady ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
          {baselineReady ? "Baseline ready" : "Need plan"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {quickScenarios.map((scenario) => (
          <button
            key={scenario.label}
            type="button"
            disabled={!baselineReady || loading}
            onClick={() => onSimulate(scenario.message, scenario.deltas)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-200"
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={scenarioText}
          onChange={(event) => setScenarioText(event.target.value)}
          placeholder="What if brishti 30% kome?"
          className="h-11 min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100"
        />
        <button
          type="submit"
          disabled={!baselineReady || loading}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Simulate
        </button>
      </form>

      {!result ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Run a complete season plan, then simulate a rainfall or budget shock to see changed numbers.
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{result.scenarioLabel}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{result.recommendation}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.comparison.netProfitBdt >= 0 ? "bg-success-50 text-success-600" : "bg-error-50 text-error-600"}`}>
                {result.comparison.netProfitBdt >= 0 ? "+" : ""}{formatMoney(result.comparison.netProfitBdt)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <ScenarioPlanCard title="Baseline" plan={result.baseline.seasonPlan} weather={result.baseline.weather} />
            <ScenarioPlanCard title="Scenario" plan={result.scenario.seasonPlan} weather={result.scenario.weather} />
          </div>

          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <div className="grid grid-cols-[minmax(130px,1fr)_120px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-white/[0.04]">
              <div>Changed value</div>
              <div className="text-right">Delta</div>
            </div>
            {[
              ["7-day rainfall", `${result.comparison.rainfall7dMm >= 0 ? "+" : ""}${result.comparison.rainfall7dMm} mm`],
              ["Revenue", signedMoney(result.comparison.revenueBdt)],
              ["Cost", signedMoney(result.comparison.costBdt)],
              ["Net profit", signedMoney(result.comparison.netProfitBdt)],
              ["ROI", `${result.comparison.roiPct >= 0 ? "+" : ""}${result.comparison.roiPct}%`],
              ["Break-even yield", `${result.comparison.breakEvenYieldKg >= 0 ? "+" : ""}${result.comparison.breakEvenYieldKg} kg`],
              ["Irrigation events", `${result.comparison.irrigationEvents >= 0 ? "+" : ""}${result.comparison.irrigationEvents}`],
              ["Budget surplus", signedMoney(result.comparison.budgetSurplusBdt)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[minmax(130px,1fr)_120px] border-b border-gray-100 px-3 py-2 text-sm last:border-0 dark:border-gray-800">
                <div className="text-gray-600 dark:text-gray-300">{label}</div>
                <div className="text-right font-semibold text-gray-900 dark:text-white">{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Scenario Trace</p>
            <div className="mt-2 space-y-2">
              {result.trace.map((event) => (
                <details key={event.traceId ?? event.toolName} className="rounded-lg bg-gray-50 p-2 dark:bg-white/[0.04]">
                  <summary className="cursor-pointer text-xs font-medium text-gray-800 dark:text-gray-100">
                    {event.toolName}
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-300">
                    {JSON.stringify(event.rawResponse, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ScenarioPlanCard({ title, plan, weather }: { title: string; plan: ScenarioSimulationResult["baseline"]["seasonPlan"]; weather: ScenarioSimulationResult["baseline"]["weather"] }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{title}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Crop" value={plan.crop} />
        <Metric label="Rain 7d" value={`${weather.daily.slice(0, 7).reduce((sum, day) => sum + day.rainfallMm, 0).toFixed(1)} mm`} />
        <Metric label="Yield" value={`${plan.financials.expectedYieldKg} kg`} />
        <Metric label="Revenue" value={formatMoney(plan.financials.expectedRevenueBdt)} />
        <Metric label="Cost" value={formatMoney(plan.financials.totalCostBdt)} />
        <Metric label="Net" value={formatMoney(plan.financials.netProfitBdt)} />
        <Metric label="ROI" value={`${plan.financials.roiPct}%`} />
        <Metric label="Irrigation" value={plan.schedulerSummary?.irrigationEvents ?? plan.tasks.filter((task) => task.phase === "irrigation").length} />
      </div>
    </div>
  );
}

function ContextPanel({ context }: { context: ContextBundle | null }) {
  if (!context) {
    return <EmptyStage title="Context" text="Context hydration appears after a session, user, farm, or memory lookup is available." />;
  }

  const profile = context.profileSnapshot ?? context.profile;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Fetched Context</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Cache, profile, prior analyses, mem0 recall, and tenant/hub KB used before agent work.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase text-brand-500">
          {context.cache.status}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Memory user" value={shortId(context.identity.memoryUserId)} />
        <Metric label="TTL" value={`${Math.round(context.cache.ttlMs / 1000)}s`} />
        <Metric label="Outcomes" value={context.memory.outcomes.length} />
        <Metric label="KB hits" value={context.kbHits.length} />
      </div>

      {profile && (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <p className="text-xs font-semibold text-gray-900 dark:text-white">Profile Snapshot</p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
              <Metric label="Location" value={profile.locationText ?? "n/a"} />
              <Metric label="Soil" value={profile.soilType ?? "n/a"} />
              <Metric label="Water" value={profile.waterAvailability ?? "n/a"} />
              <Metric label="Size" value={profile.sizeAcres ? `${profile.sizeAcres} acres` : "n/a"} />
              <Metric label="Budget" value={profile.budgetBdt ? formatMoney(profile.budgetBdt) : "n/a"} />
              <Metric label="Season" value={profile.targetSeason ?? "n/a"} />
            </div>
          </div>
          <FarmWeatherMap title="Profile Location" profile={profile} className="p-3" />
        </div>
      )}

      {context.priorAnalyses.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Prior Analyses</p>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {context.priorAnalyses.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{item.title}</p>
                  <span className="text-[11px] capitalize text-gray-500 dark:text-gray-400">{item.kind.replace("_", " ")}</span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{item.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <ContextList
          title="mem0 Recall"
          empty="No mem0 memories returned for this context."
          items={context.memory.mem0.map((item) => ({
            id: item.id,
            title: item.title,
            body: item.content,
            meta: item.score ? `score ${item.score.toFixed(2)}` : "mem0",
          }))}
        />
        <ContextList
          title="Knowledge Base"
          empty="No tenant/hub KB hits returned yet."
          items={context.kbHits.map((hit, index) => ({
            id: hit.docKey ?? `kb-${index}`,
            title: hit.source ?? hit.docKey ?? "KB source",
            body: hit.text,
            meta: hit.citation,
          }))}
        />
      </div>

      {context.warnings.length > 0 && (
        <div className="mt-4 rounded-lg border border-warning-500/30 bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
          {context.warnings.join(" ")}
        </div>
      )}
    </section>
  );
}

function ContextList({
  title,
  empty,
  items,
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; body: string; meta: string }>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
      <p className="text-xs font-semibold text-gray-900 dark:text-white">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.slice(0, 4).map((item) => (
            <div key={item.id} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-gray-900 dark:text-white">{item.title}</p>
                <span className="truncate text-[11px] text-gray-400">{item.meta}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-gray-500 dark:text-gray-400">{item.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
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
      {profile && (profile.latitude !== undefined || profile.longitude !== undefined) && (
        <div className="mt-4">
          <FarmWeatherMap title="Saved Farm Location" profile={profile} />
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
      <div className="mt-4">
        <FarmWeatherMap
          title="Weather Map"
          profile={result?.farmProfile}
          weather={weather}
          cropLabel={result?.seasonPlan?.crop ?? result?.farmProfile.currentCrop}
        />
      </div>
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
          <TaskRow key={`${task.phase}-${task.startDate}`} task={task} crop={plan.crop} />
        ))}
      </div>
    </section>
  );
}

function FertigationPanel({ plan }: { plan: NonNullable<AgriSenseMessageResult["seasonPlan"]> }) {
  const tasks = plan.tasks.filter((task) => task.phase === "fertilizer" || task.phase === "irrigation");
  const summary = plan.schedulerSummary;
  const totals = summary?.fertilizerTotals ?? {};

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Fertilizer & Irrigation</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            FRG dose scaling, growth-stage timing, crop-water checkpoints, organic alternatives, and forecast warnings.
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
          {summary?.cropId ?? plan.crop}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Fertilizer cost" value={formatMoney(summary?.totalFertilizerCostBdt ?? sumTaskCosts(tasks, "fertilizer"))} />
        <Metric label="Irrigation cost" value={formatMoney(summary?.totalIrrigationCostBdt ?? sumTaskCosts(tasks, "irrigation"))} />
        <Metric label="Irrigation events" value={summary?.irrigationEvents ?? tasks.filter((task) => task.phase === "irrigation").length} />
        <Metric label="Rain warnings" value={summary?.rainDelayWarnings ?? tasks.filter((task) => task.delayRecommended).length} />
        <Metric label="Fertility" value={`${summary?.fertilityClass ?? "medium"} (${summary?.fertilitySource ?? "default"})`} />
        <Metric label="Urea" value={formatInputTotal(totals, "Urea")} />
        <Metric label="TSP" value={formatInputTotal(totals, "TSP")} />
        <Metric label="MoP" value={formatInputTotal(totals, "MoP")} />
      </div>

      {tasks.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No fertilizer or irrigation tasks are available for this plan.</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <div className="hidden grid-cols-[112px_120px_minmax(180px,1fr)_minmax(180px,1fr)_110px] gap-3 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-gray-800 dark:bg-white/[0.04] dark:text-gray-400 lg:grid">
            <div>Window</div>
            <div>Stage</div>
            <div>Action</div>
            <div>Inputs & Alternatives</div>
            <div className="text-right">Cost</div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-800">
            {tasks.map((task) => (
              <div key={`${task.phase}-${task.startDate}-${task.title}`} className={`grid gap-3 px-3 py-3 text-sm lg:grid-cols-[112px_120px_minmax(180px,1fr)_minmax(180px,1fr)_110px] ${task.delayRecommended ? "bg-warning-50/70 dark:bg-warning-500/10" : ""}`}>
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {formatDate(task.startDate)} - {formatDate(task.endDate)}
                </div>
                <div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${task.phase === "fertilizer" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"}`}>
                    {task.growthStage ?? task.phase}
                  </span>
                  <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">{task.source ?? "scheduler"}</p>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{task.title}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.description}</p>
                  {task.weatherNote && (
                    <p className="mt-2 rounded-lg border border-warning-500/30 bg-warning-50 px-2 py-1 text-xs font-medium text-warning-700 dark:bg-warning-500/10 dark:text-warning-400">
                      {task.weatherNote}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {(task.inputs ?? []).map((input) => (
                    <div key={`${task.title}-${input.item}`} className="flex items-start justify-between gap-2 rounded-lg bg-gray-50 px-2 py-1.5 text-xs dark:bg-white/[0.04]">
                      <span className="font-medium text-gray-800 dark:text-gray-100">{input.item}</span>
                      <span className="text-right text-gray-600 dark:text-gray-300">
                        {input.quantity} {input.unit}
                        {input.totalCostBdt ? ` · ${formatMoney(input.totalCostBdt)}` : ""}
                      </span>
                    </div>
                  ))}
                  {task.organicAlternative && (
                    <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{task.organicAlternative}</p>
                  )}
                </div>
                <div className="text-right text-xs font-semibold text-gray-900 dark:text-white">
                  {task.totalCostBdt ? formatMoney(task.totalCostBdt) : "No direct cost"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary?.sources.length ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Sources: {summary.sources.join(" · ")}
        </p>
      ) : null}
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
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Financial Projection</h2>
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

function TaskRow({ task, crop }: { task: SeasonPlanTask; crop?: string }) {
  return (
    <div className="grid gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-800 md:grid-cols-[140px_minmax(0,1fr)_110px]">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {formatDate(task.startDate)} - {formatDate(task.endDate)}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{task.title}</p>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{task.description}</p>
        {task.inputs && task.inputs.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {task.inputs.map((input) => (
              <Link
                key={`${task.title}-${input.item}`}
                to={marketplaceUrlForInput(input.item, input.quantity, input.unit, crop)}
                className="rounded-md border border-success-200 bg-success-50 px-2 py-1 text-xs font-medium text-success-700 hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"
              >
                {input.item}: {input.quantity} {input.unit}
              </Link>
            ))}
          </div>
        )}
        {task.weatherNote && (
          <p className="mt-1 text-xs font-medium leading-5 text-warning-700 dark:text-warning-400">{task.weatherNote}</p>
        )}
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

function signedMoney(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatMoney(value)}`;
}

function sumTaskCosts(tasks: SeasonPlanTask[], phase: string): number {
  return tasks.filter((task) => task.phase === phase).reduce((sum, task) => sum + (task.totalCostBdt ?? 0), 0);
}

function marketplaceUrlForInput(item: string, quantity: number, unit: string, crop?: string): string {
  const params = new URLSearchParams({
    itemName: normalizeMarketplaceItem(item),
    quantity: String(quantity),
    unit,
    crop: normalizeMarketplaceCrop(crop ?? item),
  });
  return `/marketplace?${params.toString()}`;
}

function normalizeMarketplaceItem(item: string): string {
  const normalized = item.toLowerCase();
  if (normalized.includes("urea")) return "Urea fertilizer";
  if (normalized.includes("tsp")) return "TSP fertilizer";
  if (normalized.includes("mop") || normalized.includes("potash")) return "MoP fertilizer";
  return item;
}

function normalizeMarketplaceCrop(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("rice") || normalized.includes("aman") || normalized.includes("boro")) return "rice";
  if (normalized.includes("maize")) return "maize";
  if (normalized.includes("mustard")) return "mustard";
  return "rice";
}

function formatInputTotal(totals: Record<string, number>, label: string): string {
  const match = Object.entries(totals).find(([key]) => key.toLowerCase().includes(label.toLowerCase()));
  return match ? `${match[1]} kg` : "0 kg";
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

function roundCoord(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function resultFromWorkspace(
  workspace: AgriSenseWorkspace | null,
  selectedFarmId: string | undefined,
  activeStage: ViewStage,
): AgriSenseMessageResult | null {
  const farm = workspace?.farmCards.find((card) => card.farmId === selectedFarmId) ?? workspace?.farmCards[0];
  if (!farm) return null;
  const weatherCard = workspace?.weatherCards.find((card) => card.farmId === farm.farmId);
  const evidenceCard = workspace?.evidenceCards.find((card) => card.farmId === farm.farmId || card.sessionId === farm.sessionId);
  const rankingCard = workspace?.rankingCards.find((card) => card.farmId === farm.farmId || card.sessionId === farm.sessionId);
  const planCard = workspace?.planCards.find((card) => card.farmId === farm.farmId || card.sessionId === farm.sessionId);
  const includeWeather = activeStage !== "intake" && Boolean(weatherCard);
  const includeEvidence = activeStage !== "intake" && activeStage !== "weather" && Boolean(evidenceCard);
  const includeRanking = ["crop_ranking", "season_plan", "scheduler", "financials", "scenario", "trace", "full"].includes(activeStage) && Boolean(rankingCard);
  const includePlan = ["season_plan", "scheduler", "financials", "scenario", "trace", "full"].includes(activeStage) && Boolean(planCard);

  return {
    sessionId: farm.sessionId ?? "",
    farmerId: farm.farmerId,
    farmId: farm.farmId,
    workflowStage: activeStage === "context" || activeStage === "scheduler" || activeStage === "scenario" || activeStage === "trace"
      ? "full"
      : activeStage,
    nextAvailableStages: farm.completion === "complete" ? ["weather", "evidence", "crop_ranking", "season_plan", "financials", "full"] : ["intake"],
    assistantMessage: farm.completion === "complete"
      ? `Loaded saved farm profile for ${farm.profile.locationText ?? "this farm"}. Continue from ${stageLabels[activeStage]}.`
      : `Saved farm profile is missing ${farm.missingFields.join(", ")}.`,
    missingFields: farm.missingFields,
    farmProfile: farm.profile,
    weather: includeWeather ? weatherCard?.weather : undefined,
    retrievedEvidence: includeEvidence ? evidenceCard?.retrievedEvidence : undefined,
    cropRankings: includeRanking ? rankingCard?.cropRankings : undefined,
    seasonPlan: includePlan ? planCard?.seasonPlan : undefined,
    rememberedOutcomes: workspace?.outcomeCards ?? [],
    trace: [],
  };
}

function chooseWorkspaceFarmId(
  workspace: AgriSenseWorkspace,
  activeStage: ViewStage,
  currentFarmId: string | undefined,
): string | undefined {
  const current = currentFarmId && workspace.farmCards.some((card) => card.farmId === currentFarmId) ? currentFarmId : undefined;
  const byData = (farmIds: Array<string | undefined>) => farmIds.find((id): id is string => Boolean(id && workspace.farmCards.some((card) => card.farmId === id)));
  const completeFarm = workspace.farmCards.find((card) => card.completion === "complete")?.farmId;
  const firstFarm = workspace.farmCards[0]?.farmId;

  if (activeStage === "weather") {
    return byData(workspace.weatherCards.map((card) => card.farmId)) ?? current ?? completeFarm ?? firstFarm;
  }
  if (activeStage === "evidence") {
    return byData(workspace.evidenceCards.map((card) => card.farmId)) ?? byData(workspace.weatherCards.map((card) => card.farmId)) ?? current ?? completeFarm ?? firstFarm;
  }
  if (activeStage === "crop_ranking") {
    return byData(workspace.rankingCards.map((card) => card.farmId)) ?? byData(workspace.evidenceCards.map((card) => card.farmId)) ?? current ?? completeFarm ?? firstFarm;
  }
  if (["season_plan", "scheduler", "financials", "scenario"].includes(activeStage)) {
    return byData(workspace.planCards.map((card) => card.farmId)) ?? byData(workspace.rankingCards.map((card) => card.farmId)) ?? current ?? completeFarm ?? firstFarm;
  }
  return current ?? completeFarm ?? firstFarm;
}

function actionsForFarm(
  farm: WorkspaceFarmCard,
  hasWeather: boolean,
  hasEvidence: boolean,
): WorkspaceSuggestedAction[] {
  const base = { farmId: farm.farmId, farmerId: farm.farmerId, sessionId: farm.sessionId };
  if (farm.completion === "incomplete") {
    return [{
      id: "complete_intake",
      label: "Complete intake",
      workflowStage: "intake",
      ...base,
      reason: `${farm.missingFields.length} required field(s) missing.`,
    }];
  }
  return [
    {
      id: "run_weather",
      label: hasWeather ? "Refresh weather" : "Fetch weather",
      workflowStage: "weather",
      ...base,
      reason: "Use saved profile to call live weather directly.",
    },
    {
      id: "run_evidence",
      label: hasEvidence ? "Refresh evidence" : "Retrieve evidence",
      workflowStage: "evidence",
      ...base,
      reason: hasWeather ? "Use profile plus weather for RAG retrieval." : "Weather will run first, then evidence retrieval.",
    },
    {
      id: "continue_crop_ranking",
      label: "Continue crop ranking",
      workflowStage: "crop_ranking",
      ...base,
      reason: "Rank crops after weather and evidence are available.",
    },
    {
      id: "run_season_plan",
      label: "Generate season plan",
      workflowStage: "full",
      ...base,
      reason: "Produce dated work, finance math, and scheduler tasks from the ranked plan.",
    },
  ];
}

function profileSummary(profile: IntakeProfile): string {
  return [
    profile.locationText,
    profile.sizeAcres ? `${profile.sizeAcres} acres` : undefined,
    profile.soilType,
    profile.waterAvailability,
    profile.budgetBdt ? formatMoney(profile.budgetBdt) : undefined,
    profile.targetSeason,
  ].filter(Boolean).join(" · ") || "Saved farm";
}

function normalizeStage(value: string | null): ViewStage {
  return workflowStages.some((stage) => stage.id === value) ? (value as ViewStage) : "full";
}

const successPillClass = "rounded-full bg-success-50 px-2.5 py-1 text-[11px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-400";
const warningPillClass = "rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-400";
