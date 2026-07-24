/**
 * Main AgriSense Tier-0 orchestrator except bdapps and teammate-owned KB.
 * It chains intake -> weather -> crop ranking -> plan/finance -> trace.
 */
import { randomUUID } from "node:crypto";
import { IntakeService } from "../agent/intakeService.js";
import { getDefaultIntakeStore } from "../agent/intakeStore.js";
import { type IntakeRequest, type IntakeTraceEvent, type IntakeTurnResult } from "../agent/intakeSchema.js";
import { buildMultilingualQuery, localizePlanSummary, localizeSeasonPlan, normalizeLanguage } from "../language/localization.js";
import { defaultKnowledgeRetriever, type KnowledgeRetriever } from "./knowledgeRetriever.js";
import { buildSeasonPlan, rankCrops, selectCrop } from "./planningEngine.js";
import { getDefaultAgriSenseStore, type AgriSenseStore } from "./agrisenseStore.js";
import { getWeatherForecast, mockWeatherForecast } from "./weatherTool.js";
import { type AgriSenseMessageResult, type WeatherForecast } from "./types.js";

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
  ) {}

  async startSession(input: Omit<IntakeRequest, "message"> = {}): Promise<AgriSenseMessageResult> {
    return this.handleMessage({ ...input, message: "start intake" });
  }

  async handleMessage(request: IntakeRequest): Promise<AgriSenseMessageResult> {
    const intake = await this.intakeService.handleTurn(request);
    const trace = [...intake.trace];

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
        trace,
      };
    }

    return this.runPlanningWorkflow(request, intake, trace);
  }

  async runPlanningWorkflow(
    request: IntakeRequest,
    intake: IntakeTurnResult,
    trace: IntakeTraceEvent[] = [...intake.trace],
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
    const retrievedEvidence = await this.knowledgeRetriever.retrieve({
      message: request.message,
      profile: intake.profile,
      weather,
      language,
      userId: request.userId,
      tenantId: request.tenantId,
    });
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
      trace,
    };
  }

  async listTrace(sessionId: string): Promise<unknown[]> {
    return this.store.listTrace(sessionId);
  }

  async getPlan(planId: string): Promise<unknown | undefined> {
    return this.store.getPlan(planId);
  }

  private async trace(sessionId: string, trace: IntakeTraceEvent[], event: IntakeTraceEvent): Promise<IntakeTraceEvent> {
    const nextEvent = { ...event, traceId: event.traceId ?? randomUUID() };
    trace.push(nextEvent);
    await this.store.saveTrace(sessionId, nextEvent);
    return nextEvent;
  }
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

function inferTriggerReason(request: IntakeRequest): NonNullable<IntakeRequest["triggerReason"]> {
  if (request.selectedCrop) return "crop_selected";
  if (/\b(replan|recalculate|again|what if|scenario)\b/i.test(request.message)) return "user_requested_replan";
  return "intake_completed";
}

export const agriSenseService = new AgriSenseService();
