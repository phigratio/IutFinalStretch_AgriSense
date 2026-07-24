/**
 * One shared agent session for the whole app: chat history, farm profile,
 * latest crop rankings / season plan / weather, and per-turn trace events.
 * Chat writes here; Plan, Money, and Trace tabs read from here — so a number
 * shown anywhere always came from a backend response in this session.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { sendMessage } from '@/api/agrisense';
import type {
  AgriSenseMessageResult,
  CropRecommendation,
  IntakeProfile,
  IntakeTraceEvent,
  MemoryOutcome,
  SeasonPlanResult,
  WeatherForecast,
} from '@/api/types';

export interface ChatBubble {
  id: string;
  role: 'farmer' | 'agent' | 'error';
  text: string;
  /** Tool calls the agent made while producing this reply (inline chips). */
  trace?: IntakeTraceEvent[];
  missingFields?: string[];
}

interface SessionState {
  sessionId?: string;
  farmerId?: string;
  farmId?: string;
  profile?: IntakeProfile;
  weather?: WeatherForecast;
  cropRankings?: CropRecommendation[];
  seasonPlan?: SeasonPlanResult;
  rememberedOutcomes: MemoryOutcome[];
  useMemory: boolean;
  bubbles: ChatBubble[];
  sending: boolean;
  send: (text: string, acceptedOutcomeIds?: string[]) => Promise<void>;
  ignoreOutcome: (id: string) => void;
  setUseMemory: (enabled: boolean) => void;
  reset: () => void;
}

const SessionContext = createContext<SessionState | undefined>(undefined);

let nextId = 0;
const bubbleId = () => `b${++nextId}`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>();
  const [farmerId, setFarmerId] = useState<string>();
  const [farmId, setFarmId] = useState<string>();
  const [profile, setProfile] = useState<IntakeProfile>();
  const [weather, setWeather] = useState<WeatherForecast>();
  const [cropRankings, setCropRankings] = useState<CropRecommendation[]>();
  const [seasonPlan, setSeasonPlan] = useState<SeasonPlanResult>();
  const [rememberedOutcomes, setRememberedOutcomes] = useState<MemoryOutcome[]>([]);
  const [ignoredOutcomeIds, setIgnoredOutcomeIds] = useState<string[]>([]);
  const [useMemory, setUseMemory] = useState(true);
  const [bubbles, setBubbles] = useState<ChatBubble[]>([]);
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string, acceptedOutcomeIds?: string[]) => {
      const message = text.trim();
      if (message === '' || sending) return;
      setSending(true);
      setBubbles((prev) => [...prev, { id: bubbleId(), role: 'farmer', text: message }]);
      try {
        const res: AgriSenseMessageResult = await sendMessage({
          message,
          sessionId,
          farmerId,
          farmId,
          useMemory,
          acceptedOutcomeIds,
          ignoredOutcomeIds,
        });
        setSessionId(res.sessionId);
        setFarmerId(res.farmerId);
        setFarmId(res.farmId);
        setProfile(res.farmProfile);
        if (res.weather) setWeather(res.weather);
        if (res.cropRankings) setCropRankings(res.cropRankings);
        if (res.seasonPlan) setSeasonPlan(res.seasonPlan);
        if (res.rememberedOutcomes) {
          setRememberedOutcomes(res.rememberedOutcomes.filter((outcome) => !ignoredOutcomeIds.includes(outcome.id)));
        }
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
    [sessionId, farmerId, farmId, useMemory, ignoredOutcomeIds, sending],
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
    setCropRankings(undefined);
    setSeasonPlan(undefined);
    setRememberedOutcomes([]);
    setIgnoredOutcomeIds([]);
    setBubbles([]);
  }, []);

  const value = useMemo(
    () => ({
      sessionId,
      farmerId,
      farmId,
      profile,
      weather,
      cropRankings,
      seasonPlan,
      rememberedOutcomes,
      useMemory,
      bubbles,
      sending,
      send,
      ignoreOutcome,
      setUseMemory,
      reset,
    }),
    [sessionId, farmerId, farmId, profile, weather, cropRankings, seasonPlan, rememberedOutcomes, useMemory, bubbles, sending, send, ignoreOutcome, reset],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
