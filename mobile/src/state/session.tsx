/**
 * One shared agent session for the whole app — mirrors the web AgriSense
 * page's state model: chat history, farm profile, latest weather / evidence /
 * crop rankings / season plan, accumulated trace, chosen language, and the
 * active workflow stage. Chat writes here; Plan, Market, Money, and Trace tabs
 * read from here, so any number shown anywhere came from a backend response.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { sendMessage, type SendMessageInput } from '@/api/agrisense';
import type {
  AgriSenseMessageResult,
  CropRecommendation,
  IntakeProfile,
  Language,
  MemoryOutcome,
  RetrievedEvidence,
  SeasonPlanResult,
  TraceEvent,
  WeatherForecast,
  WorkflowStage,
} from '@/api/types';

export interface ChatBubble {
  id: string;
  role: 'farmer' | 'agent' | 'error';
  text: string;
  trace?: TraceEvent[];
  missingFields?: string[];
}

interface SessionState {
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  language: Language;
  profile?: IntakeProfile;
  weather?: WeatherForecast;
  evidence?: RetrievedEvidence[];
  cropRankings?: CropRecommendation[];
  seasonPlan?: SeasonPlanResult;
  rememberedOutcomes: MemoryOutcome[];
  useMemory: boolean;
  missingFields: string[];
  result?: AgriSenseMessageResult;
  trace: TraceEvent[];
  bubbles: ChatBubble[];
  sending: boolean;
  setLanguage: (lang: Language) => void;
  setUseMemory: (enabled: boolean) => void;
  send: (
    text: string,
    stageOrAcceptedOutcomeIds?: WorkflowStage | string[],
    acceptedOutcomeIds?: string[],
  ) => Promise<void>;
  ignoreOutcome: (id: string) => void;
  reset: () => void;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

let nextId = 0;
const bubbleId = () => `b${++nextId}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>();
  const [farmerId, setFarmerId] = useState<string>();
  const [farmId, setFarmId] = useState<string>();
  const [language, setLanguage] = useState<Language>('en');
  const [profile, setProfile] = useState<IntakeProfile>();
  const [weather, setWeather] = useState<WeatherForecast>();
  const [evidence, setEvidence] = useState<RetrievedEvidence[]>();
  const [cropRankings, setCropRankings] = useState<CropRecommendation[]>();
  const [seasonPlan, setSeasonPlan] = useState<SeasonPlanResult>();
  const [rememberedOutcomes, setRememberedOutcomes] = useState<MemoryOutcome[]>([]);
  const [ignoredOutcomeIds, setIgnoredOutcomeIds] = useState<string[]>([]);
  const [useMemory, setUseMemory] = useState(true);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [result, setResult] = useState<AgriSenseMessageResult>();
  const [trace, setTrace] = useState<TraceEvent[]>([]);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (
      text: string,
      stageOrAcceptedOutcomeIds?: WorkflowStage | string[],
      acceptedOutcomeIds?: string[],
    ) => {
      const message = text.trim();
      if (message === '' || sending) return;

      const workflowStage = typeof stageOrAcceptedOutcomeIds === 'string'
        ? stageOrAcceptedOutcomeIds
        : undefined;
      const acceptedIds = Array.isArray(stageOrAcceptedOutcomeIds)
        ? stageOrAcceptedOutcomeIds
        : acceptedOutcomeIds;

      setSending(true);
      setBubbles((prev) => [...prev, { id: bubbleId(), role: 'farmer', text: message }]);
      try {
        const input: SendMessageInput = {
          message,
          sessionId,
          farmerId,
          farmId,
          useMemory,
          acceptedOutcomeIds: acceptedIds,
          ignoredOutcomeIds,
          preferredLanguage: language,
          workflowStage,
          triggerReason:
            workflowStage === 'weather'
              ? 'weather_refreshed'
              : workflowStage === 'full'
                ? 'user_requested_replan'
                : undefined,
        };
        const res = await sendMessage(input);
        setSessionId(res.sessionId);
        setFarmerId(res.farmerId);
        setFarmId(res.farmId);
        setProfile(res.farmProfile);
        setMissingFields(res.missingFields ?? []);
        setResult(res);
        if (res.weather) setWeather(res.weather);
        if (res.retrievedEvidence) setEvidence(res.retrievedEvidence);
        else if (res.seasonPlan?.retrievedEvidence) setEvidence(res.seasonPlan.retrievedEvidence);
        if (res.cropRankings) setCropRankings(res.cropRankings);
        if (res.seasonPlan) setSeasonPlan(res.seasonPlan);
        if (res.rememberedOutcomes) {
          setRememberedOutcomes(res.rememberedOutcomes.filter((outcome) => !ignoredOutcomeIds.includes(outcome.id)));
        }
        if (res.trace?.length) setTrace((prev) => [...prev, ...res.trace]);
        setBubbles((prev) => [
          ...prev,
          {
            id: bubbleId(),
            role: 'agent',
            text: res.assistantMessage,
            trace: res.trace,
            missingFields: res.missingFields,
          },
        ]);
      } catch (err) {
        setBubbles((prev) => [
          ...prev,
          { id: bubbleId(), role: 'error', text: (err as Error).message },
        ]);
      } finally {
        setSending(false);
      }
    },
    [sessionId, farmerId, farmId, useMemory, ignoredOutcomeIds, language, sending],
  );

  const ignoreOutcome = useCallback((id: string) => {
    setIgnoredOutcomeIds((prev) => prev.includes(id) ? prev : [...prev, id]);
    setRememberedOutcomes((prev) => prev.filter((outcome) => outcome.id !== id));
  }, []);

  const reset = useCallback(() => {
    setSessionId(undefined);
    setFarmerId(undefined);
    setFarmId(undefined);
    setProfile(undefined);
    setWeather(undefined);
    setEvidence(undefined);
    setCropRankings(undefined);
    setSeasonPlan(undefined);
    setRememberedOutcomes([]);
    setIgnoredOutcomeIds([]);
    setMissingFields([]);
    setResult(undefined);
    setTrace([]);
    setBubbles([]);
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      farmerId,
      farmId,
      language,
      profile,
      weather,
      evidence,
      cropRankings,
      seasonPlan,
      rememberedOutcomes,
      useMemory,
      missingFields,
      result,
      trace,
      bubbles,
      sending,
      setLanguage,
      setUseMemory,
      send,
      ignoreOutcome,
      reset,
    }),
    [
      sessionId,
      farmerId,
      farmId,
      language,
      profile,
      weather,
      evidence,
      cropRankings,
      seasonPlan,
      rememberedOutcomes,
      useMemory,
      missingFields,
      result,
      trace,
      bubbles,
      sending,
      send,
      ignoreOutcome,
      reset,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
