/**
 * Main AgriSense Tier-0 orchestrator except bdapps and teammate-owned KB.
 * It chains intake -> weather -> crop ranking -> plan/finance -> trace.
 */
import { IntakeService } from "../agent/intakeService.js";
import { getDefaultIntakeStore } from "../agent/intakeStore.js";
import { type IntakeRequest, type IntakeTraceEvent } from "../agent/intakeSchema.js";
import { buildMultilingualQuery, localizePlanSummary, localizeSeasonPlan, normalizeLanguage } from "../language/localization.js";
import { buildSeasonPlan, rankCrops } from "./planningEngine.js";
import { getDefaultAgriSenseStore, type AgriSenseStore } from "./agrisenseStore.js";
import { getWeatherForecast, mockWeatherForecast } from "./weatherTool.js";
import { type AgriSenseMessageResult, type WeatherForecast } from "./types.js";

export interface WeatherProvider {
  get(locationText: string): Promise<WeatherForecast>;
}

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
  ) {}

  async startSession(input: Omit<IntakeRequest, "message"> = {}): Promise<AgriSenseMessageResult> {
    return this.handleMessage({ ...input, message: "start intake" });
  }

  async handleMessage(request: IntakeRequest): Promise<AgriSenseMessageResult> {
    const intake = await this.intakeService.handleTurn(request);
    const trace = [...intake.trace];
    const language = normalizeLanguage(intake.profile.preferredLanguage) ?? "en";

    if (!intake.intakeComplete) {
      return {
        sessionId: intake.sessionId,
        farmerId: intake.farmerId,
        farmId: intake.farmId,
        assistantMessage: intake.reply,
        missingFields: intake.missingFields,
        farmProfile: intake.profile,
        trace,
      };
    }

    await this.trace(intake.sessionId, trace, {
      kind: "plan",
      toolName: "agent.plan",
      parameters: { goal: "weather-aware costed season plan" },
      rawResponse: {
        steps: ["get_weather", "rag.retrieve.placeholder", "rank_crops", "build_season_plan", "finance.calculate"],
      },
      status: "success",
      latencyMs: 0,
    });

    const weatherStarted = Date.now();
    let weather: WeatherForecast;
    try {
      weather = await this.weatherProvider.get(intake.profile.locationText!);
    } catch (error) {
      weather = mockWeatherForecast(intake.profile.locationText!);
      await this.trace(intake.sessionId, trace, {
        kind: "error",
        toolName: "weather.fetch",
        parameters: { locationText: intake.profile.locationText },
        rawResponse: { fallback: weather },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - weatherStarted,
      });
    }

    const weatherIds = await this.store.saveWeather(intake.sessionId, intake.farmId, weather);
    await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "weather.fetch",
      parameters: { locationText: intake.profile.locationText },
      rawResponse: weather,
      status: "success",
      latencyMs: Date.now() - weatherStarted,
    });

    await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "rag.retrieve.placeholder",
      parameters: {
        profile: intake.profile,
        language,
        normalizedQuery: buildMultilingualQuery([
          request.message,
          intake.profile.locationText,
          intake.profile.soilType,
          intake.profile.waterAvailability,
          intake.profile.targetSeason,
          intake.profile.currentCrop,
        ].filter(Boolean).join(" ")),
        note: "Knowledge base implementation is owned by teammate; deterministic seeded crop baselines used meanwhile.",
      },
      rawResponse: { chunks: [], status: "pending teammate KB" },
      status: "success",
      latencyMs: 0,
    });

    const cropStarted = Date.now();
    const cropRankings = rankCrops(intake.profile, weather);
    await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "crop.rank",
      parameters: { profile: intake.profile, weatherSummary: summarizeWeather(weather) },
      rawResponse: cropRankings,
      status: "success",
      latencyMs: Date.now() - cropStarted,
    });

    const planStarted = Date.now();
    const seasonPlan = await this.store.saveSeasonPlan(
      intake.sessionId,
      intake.farmId,
      localizeSeasonPlan(buildSeasonPlan(intake.profile, weather, cropRankings[0]!), language),
      weatherIds,
    );
    await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "plan.generate",
      parameters: { crop: cropRankings[0]!.crop, farmId: intake.farmId },
      rawResponse: seasonPlan,
      status: "success",
      latencyMs: Date.now() - planStarted,
    });

    await this.trace(intake.sessionId, trace, {
      kind: "tool",
      toolName: "finance.calculate",
      parameters: { crop: seasonPlan.crop, areaAcres: intake.profile.sizeAcres },
      rawResponse: seasonPlan.financials,
      status: "success",
      latencyMs: 0,
    });

    return {
      sessionId: intake.sessionId,
      farmerId: intake.farmerId,
      farmId: intake.farmId,
      assistantMessage: localizePlanSummary({
        crop: cropRankings[0]!.crop,
        score: cropRankings[0]!.suitabilityScore,
        weather,
        netProfitBdt: seasonPlan.financials.netProfitBdt,
        language,
      }),
      missingFields: [],
      farmProfile: intake.profile,
      weather,
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

  private async trace(sessionId: string, trace: IntakeTraceEvent[], event: IntakeTraceEvent): Promise<void> {
    trace.push(event);
    await this.store.saveTrace(sessionId, event);
  }
}

function summarizeWeather(weather: WeatherForecast): Record<string, number> {
  return {
    rain7dMm: weather.daily.reduce((sum, day) => sum + day.rainfallMm, 0),
    maxTempTodayC: weather.daily[0]?.temperatureMaxC ?? 0,
    minTempTodayC: weather.daily[0]?.temperatureMinC ?? 0,
  };
}

export const agriSenseService = new AgriSenseService();
