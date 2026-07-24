/**
 * Main AgriSense Tier-0 orchestrator except bdapps and teammate-owned KB.
 * It chains intake -> weather -> crop ranking -> plan/finance -> trace.
 */
import { randomUUID } from "node:crypto";
import { IntakeService } from "../agent/intakeService.js";
import { getDefaultIntakeStore } from "../agent/intakeStore.js";
import { type IntakeRequest, type IntakeTraceEvent, type IntakeTurnResult } from "../agent/intakeSchema.js";
import { contextHydrator, type ContextBundle } from "../context/contextService.js";
import { buildMultilingualQuery, localizePlanSummary, localizeSeasonPlan, normalizeLanguage } from "../language/localization.js";
import { defaultKnowledgeRetriever, type KnowledgeRetriever } from "./knowledgeRetriever.js";
import { getDefaultMemoryOutcomeService, type MemoryOutcome, type MemoryOutcomeService } from "./memoryOutcomeService.js";
import { buildSeasonPlan, rankCrops, selectCrop } from "./planningEngine.js";
import { simulateScenario, type ScenarioBaseline } from "./scenarioEngine.js";
import { getDefaultAgriSenseStore, type AgriSenseStore } from "./agrisenseStore.js";
import { getWeatherForecast, mockWeatherForecast } from "./weatherTool.js";
import { type AgriSenseMessageResult, type MemoryLookupResult, type ScenarioDeltas, type ScenarioSimulationResult, type WeatherForecast } from "./types.js";

export interface WeatherProvider {
  get(locationText: string): Promise<WeatherForecast>;
}

type WorkflowStage = NonNullable<IntakeRequest["workflowStage"]>;

export class OpenMeteoWeatherProvider implements WeatherProvider {
  async get(locationText: string): Promise<WeatherForecast> {
    return getWeatherForecast(locationText);
  }
}

export class AgriSenseService {
  constructor(
    private readonly intakeService = new IntakeService(getDefaultIntakeStore()),
    private readonly store: AgriSenseStore = getDefaultAgriSenseStore(),
    private readonly weatherProvider: WeatherProvider = new OpenMeteoWeatherProvider(),
    private readonly knowledgeRetriever: KnowledgeRetriever = defaultKnowledgeRetriever,
    private readonly memoryOutcomes: MemoryOutcomeService = getDefaultMemoryOutcomeService(),
  ) {}

  async startSession(input: Omit<IntakeRequest, "message"> = {}): Promise<AgriSenseMessageResult> {
    return this.handleMessage({ ...input, message: "start intake" });
  }

  async handleMessage(request: IntakeRequest): Promise<AgriSenseMessageResult> {
    let intake = await this.intakeService.handleTurn(request);
    const trace = [...intake.trace];
    const memoryTrace: IntakeTraceEvent[] = [];
    let rememberedOutcomes: MemoryOutcome[] = [];
    const context = await contextHydrator.hydrate({
      message: request.message,
      userId: request.userId,
      tenantId: request.tenantId,
      farmerId: intake.farmerId,
      farmId: intake.farmId,
      sessionId: intake.sessionId,
      bdappsMobile: intake.profile.bdappsMobile ?? request.bdappsMobile,
      language: normalizeLanguage(request.preferredLanguage ?? intake.profile.preferredLanguage),
      cropId: request.selectedCrop ?? intake.profile.currentCrop,
      refresh: request.triggerReason === "profile_updated",
      limit: 8,
    });
    trace.push(...context.trace);
    memoryTrace.push(...context.trace);

    if (request.useMemory !== false) {
      const memoryStarted = Date.now();
      const serviceMemory = await this.memoryOutcomes.list({
        userId: request.userId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        bdappsMobile: intake.profile.bdappsMobile ?? request.bdappsMobile,
        limit: 8,
      });
      const memoryResult = {
        outcomes: uniqueById([...serviceMemory.outcomes, ...context.memory.outcomes]),
        sessions: uniqueById([...serviceMemory.sessions, ...context.memory.sessions]),
      };
      rememberedOutcomes = filterIgnored(memoryResult.outcomes, request.ignoredOutcomeIds);
      const searchTrace = await this.trace(intake.sessionId, trace, {
        kind: "tool",
        toolName: "memory.search",
        parameters: {
          userId: request.userId,
          farmerId: intake.farmerId,
          farmId: intake.farmId,
          bdappsMobile: intake.profile.bdappsMobile ?? request.bdappsMobile,
          useMemory: Boolean(request.useMemory ?? true),
        },
        rawResponse: {
          outcomes: rememberedOutcomes.map((outcome) => ({
            id: outcome.id,
            kind: outcome.kind,
            title: outcome.title,
            score: outcome.score,
          })),
          sessions: memoryResult.sessions,
        },
        status: "success",
        latencyMs: Date.now() - memoryStarted,
      });
      memoryTrace.push(searchTrace);

      const rememberedProfile = this.memoryOutcomes.applyToProfile(
        intake.profile,
        rememberedOutcomes,
        request.acceptedOutcomeIds,
      );
      if (profileChanged(intake.profile, rememberedProfile)) {
        const profileBeforeMemory = intake.profile;
        intake = await this.intakeService.applyProfilePatch(intake.profile, rememberedProfile);
        const applyTrace = await this.trace(intake.sessionId, trace, {
          kind: "tool",
          toolName: "memory.apply",
          parameters: {
            acceptedOutcomeIds: request.acceptedOutcomeIds,
            appliedFields: changedProfileFields(
              profileBeforeMemory as Record<string, unknown>,
              rememberedProfile as Record<string, unknown>,
            ),
          },
          rawResponse: { profile: intake.profile, missingFields: intake.missingFields },
          status: "success",
          latencyMs: 0,
        });
        memoryTrace.push(applyTrace);
      }
    }

    if (!intake.intakeComplete || request.workflowStage === "intake") {
      return {
        sessionId: intake.sessionId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        workflowStage: "intake",
        nextAvailableStages: intake.intakeComplete ? nextStagesFor("intake") : ["intake"],
        assistantMessage: intake.reply,
        missingFields: intake.missingFields,
        farmProfile: intake.profile,
        rememberedOutcomes,
        memoryTrace,
        context,
        trace,
      };
    }

    const result = await this.runPlanningWorkflow(request, intake, trace, context);
    return { ...result, rememberedOutcomes, memoryTrace, context };
  }

  async runPlanningWorkflow(
    request: IntakeRequest,
    intake: IntakeTurnResult,
    trace: IntakeTraceEvent[] = [...intake.trace],
    context?: ContextBundle,
  ): Promise<AgriSenseMessageResult> {
    const language = normalizeLanguage(intake.profile.preferredLanguage) ?? "en";
    const workflowStage = request.workflowStage ?? "full";
    const triggerReason = request.triggerReason ?? inferTriggerReason(request);
    const sourceTraceIds: string[] = trace.map((event) => event.traceId).filter(Boolean) as string[];

    const planTrace = await this.trace(intake.sessionId, trace, {
      kind: "plan",
      toolName: "agent.plan",
      parameters: {
        goal: "weather-aware costed season plan",
        requestedStage: workflowStage,
        triggerReason,
        selectedCrop: request.selectedCrop,
      },
      rawResponse: {
        steps: ["weather.fetch", "rag.retrieve", "crop.rank", "crop.select", "season.plan", "finance.calculate", "explanation.generate"],
      },
      status: "success",
      latencyMs: 0,
    });
    sourceTraceIds.push(planTrace.traceId!);

    const weatherStarted = Date.now();
    let weather: WeatherForecast;
    try {
      weather = await this.weatherProvider.get(intake.profile.locationText!);
    } catch (error) {
      weather = mockWeatherForecast(intake.profile.locationText!);
      const weatherErrorTrace = await this.trace(intake.sessionId, trace, {
        kind: "error",
        toolName: "weather.fetch",
        parameters: { locationText: intake.profile.locationText, triggerReason },
        rawResponse: { fallback: weather },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - weatherStarted,
      });
      sourceTraceIds.push(weatherErrorTrace.traceId!);
    }

    const weatherIds = await this.store.saveWeather(intake.sessionId, intake.farmId, weather);
    const weatherTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "weather.fetch",
      parameters: { locationText: intake.profile.locationText, triggerReason },
      rawResponse: weather,
      status: "success",
      latencyMs: Date.now() - weatherStarted,
    });
    sourceTraceIds.push(weatherTrace.traceId!);

    if (workflowStage === "weather") {
      return {
        sessionId: intake.sessionId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        workflowStage,
        nextAvailableStages: nextStagesFor("weather"),
        assistantMessage: `Weather is ready for ${weather.locationText}: ${summarizeWeather(weather).rain7dMm} mm rain expected in the next 7 days.`,
        missingFields: [],
        farmProfile: intake.profile,
        weather,
        context,
        trace,
      };
    }

    const ragStarted = Date.now();
    const retrievalQuery = buildMultilingualQuery([
      request.message,
      intake.profile.locationText,
      intake.profile.soilType,
      intake.profile.waterAvailability,
      intake.profile.targetSeason,
      intake.profile.currentCrop,
      request.selectedCrop,
    ].filter(Boolean).join(" "));
    const retrieverEvidence = await this.knowledgeRetriever.retrieve({
      message: request.message,
      profile: intake.profile,
      weather,
      language,
      userId: request.userId,
      tenantId: request.tenantId,
    });
    const retrievedEvidence = uniqueEvidence([
      ...mapContextKbHits(context),
      ...retrieverEvidence,
    ]);
    const ragTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "rag.retrieve",
      parameters: {
        profile: intake.profile,
        language,
        normalizedQuery: retrievalQuery,
      },
      rawResponse: { chunks: retrievedEvidence, count: retrievedEvidence.length },
      status: "success",
      latencyMs: Date.now() - ragStarted,
    });
    sourceTraceIds.push(ragTrace.traceId!);

    if (workflowStage === "evidence") {
      return {
        sessionId: intake.sessionId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        workflowStage,
        nextAvailableStages: nextStagesFor("evidence"),
        assistantMessage: `Retrieved ${retrievedEvidence.length} agronomic evidence item${retrievedEvidence.length === 1 ? "" : "s"} for this farm profile and weather.`,
        missingFields: [],
        farmProfile: intake.profile,
        weather,
        retrievedEvidence,
        context,
        trace,
      };
    }

    const cropStarted = Date.now();
    const cropRankings = rankCrops(intake.profile, weather, retrievedEvidence);
    const cropTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "crop.rank",
      parameters: {
        profile: intake.profile,
        weatherSummary: summarizeWeather(weather),
        evidenceIds: retrievedEvidence.map((item) => item.id),
      },
      rawResponse: cropRankings,
      status: "success",
      latencyMs: Date.now() - cropStarted,
    });
    sourceTraceIds.push(cropTrace.traceId!);

    if (workflowStage === "crop_ranking") {
      return {
        sessionId: intake.sessionId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        workflowStage,
        nextAvailableStages: nextStagesFor("crop_ranking"),
        assistantMessage: `Crop ranking is ready. Top choice is ${cropRankings[0]?.crop ?? "not available"} based on farm profile, weather, budget, and retrieved evidence.`,
        missingFields: [],
        farmProfile: intake.profile,
        weather,
        retrievedEvidence,
        cropRankings,
        context,
        trace,
      };
    }

    const selected = selectCrop(cropRankings, request.selectedCrop);
    const selectTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "crop.select",
      parameters: { requestedCrop: request.selectedCrop, rankedCrops: cropRankings.map((crop) => crop.crop) },
      rawResponse: selected,
      status: "success",
      latencyMs: 0,
    });
    sourceTraceIds.push(selectTrace.traceId!);

    const planStarted = Date.now();
    const seasonPlan = await this.store.saveSeasonPlan(
      intake.sessionId,
      intake.farmId,
      localizeSeasonPlan(buildSeasonPlan(intake.profile, weather, selected.crop, {
        triggerReason,
        selectedCropReason: selected.reason,
        sourceTraceIds,
        retrievedEvidence,
      }), language),
      weatherIds,
    );
    const planGenerateTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "season.plan",
      parameters: { crop: selected.crop.crop, farmId: intake.farmId, triggerReason },
      rawResponse: seasonPlan,
      status: "success",
      latencyMs: Date.now() - planStarted,
    });
    sourceTraceIds.push(planGenerateTrace.traceId!);

    const financeTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "finance.calculate",
      parameters: {
        crop: selected.crop.crop,
        areaAcres: intake.profile.sizeAcres,
        budgetBdt: intake.profile.budgetBdt,
      },
      rawResponse: seasonPlan.financials,
      status: "success",
      latencyMs: 0,
    });
    sourceTraceIds.push(financeTrace.traceId!);

    const assistantMessage = localizePlanSummary({
      crop: selected.crop.crop,
      score: selected.crop.suitabilityScore,
      weather,
      netProfitBdt: seasonPlan.financials.netProfitBdt,
      language,
    });
    const explanationTrace = await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "explanation.generate",
      parameters: {
        language,
        profile: intake.profile,
        selectedCrop: selected.crop.crop,
        weatherSummary: summarizeWeather(weather),
        evidenceIds: retrievedEvidence.map((item) => item.id),
      },
      rawResponse: {
        assistantMessage,
        reasoning: seasonPlan.reasoning,
        selectedCropReason: seasonPlan.selectedCropReason,
      },
      status: "success",
      latencyMs: 0,
    });
    sourceTraceIds.push(explanationTrace.traceId!);

    const outcomeStarted = Date.now();
    try {
      const createdOutcomes = await this.memoryOutcomes.rememberPlan({
        userId: request.userId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        sessionId: intake.sessionId,
        profile: intake.profile,
        plan: seasonPlan,
      });
      await this.trace(intake.sessionId, trace, {
        kind: "tool",
        toolName: "memory.outcome.add",
        parameters: {
          kinds: createdOutcomes.map((outcome) => outcome.kind),
          planId: seasonPlan.id,
        },
        rawResponse: {
          outcomes: createdOutcomes.map((outcome) => ({
            id: outcome.id,
            kind: outcome.kind,
            title: outcome.title,
            score: outcome.score,
          })),
        },
        status: "success",
        latencyMs: Date.now() - outcomeStarted,
      });
    } catch (error) {
      await this.trace(intake.sessionId, trace, {
        kind: "error",
        toolName: "memory.outcome.add",
        parameters: { planId: seasonPlan.id },
        rawResponse: { persisted: false },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - outcomeStarted,
      });
    }

    return {
      sessionId: intake.sessionId,
      farmerId: intake.farmerId,
      farmId: intake.farmId,
      workflowStage,
      nextAvailableStages: nextStagesFor(workflowStage),
      assistantMessage,
      missingFields: [],
      farmProfile: intake.profile,
      weather,
      retrievedEvidence,
      cropRankings,
      seasonPlan,
      context,
      trace,
    };
  }

  async listTrace(sessionId: string): Promise<unknown[]> {
    return this.store.listTrace(sessionId);
  }

  async getPlan(planId: string): Promise<unknown | undefined> {
    return this.store.getPlan(planId);
  }

  async getMemory(input: {
    userId?: string;
    farmerId?: string;
    farmId?: string;
    bdappsMobile?: string;
    limit?: number;
  }): Promise<MemoryLookupResult> {
    return this.memoryOutcomes.list(input);
  }

  async simulateScenario(input: {
    sessionId?: string;
    farmerId?: string;
    farmId?: string;
    planId?: string;
    userId?: string;
    tenantId?: string;
    bdappsMobile?: string;
    preferredLanguage?: IntakeRequest["preferredLanguage"];
    selectedCrop?: string;
    message?: string;
    deltas?: ScenarioDeltas;
    baseline?: AgriSenseMessageResult;
  }): Promise<ScenarioSimulationResult> {
    const baseline = input.baseline
      ? baselineFromResult(input.baseline)
      : await this.rebuildScenarioBaseline(input);
    const result = simulateScenario({
      message: input.message,
      deltas: input.deltas,
      baseline: {
        ...baseline,
        planId: input.planId ?? baseline.planId,
      },
      selectedCrop: input.selectedCrop,
    });
    for (const event of result.trace) {
      if (result.sessionId) await this.store.saveTrace(result.sessionId, event);
    }
    return this.store.saveScenarioSimulation(result);
  }

  private async rebuildScenarioBaseline(input: {
    sessionId?: string;
    farmerId?: string;
    farmId?: string;
    planId?: string;
    userId?: string;
    tenantId?: string;
    bdappsMobile?: string;
    preferredLanguage?: IntakeRequest["preferredLanguage"];
    selectedCrop?: string;
    message?: string;
  }): Promise<ScenarioBaseline> {
    const plan = input.planId ? await this.store.getPlan(input.planId) : undefined;
    const farmId = input.farmId ?? farmIdFromPlan(plan);
    const baseline = await this.handleMessage({
      message: input.message ?? "rebuild baseline for scenario simulation",
      sessionId: input.sessionId,
      userId: input.userId,
      tenantId: input.tenantId,
      farmerId: input.farmerId,
      farmId,
      bdappsMobile: input.bdappsMobile,
      preferredLanguage: input.preferredLanguage,
      selectedCrop: input.selectedCrop ?? cropFromPlan(plan),
      useMemory: true,
      workflowStage: "full",
      triggerReason: "user_requested_replan",
    });
    return baselineFromResult({ ...baseline, seasonPlan: baseline.seasonPlan ? { ...baseline.seasonPlan, id: input.planId ?? baseline.seasonPlan.id } : baseline.seasonPlan });
  }

  private async trace(sessionId: string, trace: IntakeTraceEvent[], event: IntakeTraceEvent): Promise<IntakeTraceEvent> {
    const nextEvent = { ...event, traceId: event.traceId ?? randomUUID() };
    trace.push(nextEvent);
    await this.store.saveTrace(sessionId, nextEvent);
    return nextEvent;
  }
}

function baselineFromResult(result: AgriSenseMessageResult): ScenarioBaseline {
  if (!result.weather || !result.cropRankings?.length || !result.seasonPlan) {
    throw new Error("Scenario simulation needs a complete baseline plan with weather, crop rankings, and financials");
  }
  return {
    sessionId: result.sessionId,
    farmId: result.farmId,
    planId: result.seasonPlan.id,
    farmProfile: result.farmProfile,
    weather: result.weather,
    cropRankings: result.cropRankings,
    seasonPlan: result.seasonPlan,
    retrievedEvidence: result.retrievedEvidence ?? result.seasonPlan.retrievedEvidence,
  };
}

function farmIdFromPlan(plan: unknown): string | undefined {
  if (!plan || typeof plan !== "object") return undefined;
  const value = (plan as { farm_id?: unknown; farmId?: unknown }).farm_id ?? (plan as { farmId?: unknown }).farmId;
  return typeof value === "string" ? value : undefined;
}

function cropFromPlan(plan: unknown): string | undefined {
  if (!plan || typeof plan !== "object") return undefined;
  const value = (plan as { crop?: unknown }).crop;
  return typeof value === "string" ? value : undefined;
}

function filterIgnored(outcomes: MemoryOutcome[], ignoredOutcomeIds: string[] | undefined): MemoryOutcome[] {
  if (!ignoredOutcomeIds?.length) return outcomes;
  const ignored = new Set(ignoredOutcomeIds);
  return outcomes.filter((outcome) => !ignored.has(outcome.id));
}

function profileChanged(before: object, after: object): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}

function changedProfileFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function nextStagesFor(stage: WorkflowStage): string[] {
  const stages: WorkflowStage[] = ["intake", "weather", "evidence", "crop_ranking", "season_plan", "financials", "full"];
  const index = stages.indexOf(stage);
  return index >= 0 ? stages.slice(index + 1) : stages;
}

function summarizeWeather(weather: WeatherForecast): Record<string, number> {
  return {
    rain7dMm: weather.daily.reduce((sum, day) => sum + day.rainfallMm, 0),
    maxTempTodayC: weather.daily[0]?.temperatureMaxC ?? 0,
    minTempTodayC: weather.daily[0]?.temperatureMinC ?? 0,
  };
}

function mapContextKbHits(context: ContextBundle | undefined) {
  return (context?.kbHits ?? []).map((hit, index) => ({
    id: hit.docKey ? `kb:${hit.docKey}` : `kb:${index}`,
    source: "rag" as const,
    title: hit.source ?? hit.docKey ?? "Knowledge base",
    content: hit.text,
    citation: hit.citation,
    crop: typeof hit.docKey === "string" ? hit.docKey.split(":")[0] : undefined,
    metadata: {
      score: hit.score,
      scope: hit.scope,
      tenantId: hit.tenantId,
      page: hit.page,
    },
  }));
}

function uniqueEvidence<T extends { id: string }>(items: T[]): T[] {
  return uniqueById(items);
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function inferTriggerReason(request: IntakeRequest): NonNullable<IntakeRequest["triggerReason"]> {
  if (request.selectedCrop) return "crop_selected";
  if (/\b(replan|recalculate|again|what if|scenario)\b/i.test(request.message)) return "user_requested_replan";
  return "intake_completed";
}

export const agriSenseService = new AgriSenseService();
