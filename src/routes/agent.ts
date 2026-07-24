import { Router } from "express";
import { getDefaultAgentStore } from "../agent/sessionStore.js";
import {
  applyExtracted,
  isComplete,
  nextQuestion,
  requiredFieldGaps,
  type Extractor,
} from "../agent/intake.js";
import { runPipeline, type OrchestratorProfile } from "../agent/orchestrator.js";
import { getKbRuntime } from "../kb/runtime.js";
import { HUB } from "../kb/tenancy.js";
import { runTraced } from "../tools/trace.js";
import { getDefaultExtractor } from "../llm/provider.js";
import {
  geocodeLocation,
  getForecast,
  getClimateNormals,
  type GeocodeResult,
  type ForecastResult,
  type NormalsResult,
} from "../tools/weather.js";
import type { FertilityClass, SoilTexture } from "../data/loader.js";
import type { WaterAvailability } from "../agent/ranking.js";
import type { Season } from "../agent/normalize.js";

export interface PriceContext {
  district?: string;
  farmLat?: number;
  farmLon?: number;
}

/** Injectable runtime so the route is testable without network/keys. */
export interface AgentRuntime {
  extractor: Extractor;
  geocode: (text: string) => Promise<GeocodeResult>;
  getForecast: (lat: number, lon: number) => Promise<ForecastResult>;
  getNormals: (lat: number, lon: number, months: number[]) => Promise<NormalsResult>;
  resolvePrice: (cropId: string, ctx: PriceContext) => Promise<{ pricePerKg: number; provenance?: unknown } | null>;
}

let runtime: AgentRuntime = {
  extractor: getDefaultExtractor(),
  geocode: (t) => geocodeLocation(t),
  getForecast: (lat, lon) => getForecast(lat, lon),
  getNormals: (lat, lon, months) => getClimateNormals(lat, lon, months),
  resolvePrice: async (cropId, ctx) => {
    const { priceStore, tenantStore } = getKbRuntime();
    const tenantId = ctx.district ? await tenantStore.resolveTenantIdForDistrict(ctx.district) : HUB;
    return priceStore.resolve({
      cropId,
      district: ctx.district,
      tenantId,
      farmLat: ctx.farmLat,
      farmLon: ctx.farmLon,
    });
  },
};

/** Override runtime (tests / DI). */
export function setAgentRuntime(partial: Partial<AgentRuntime>): void {
  runtime = { ...runtime, ...partial };
}

export const agentRouter: Router = Router();

agentRouter.post("/agent/message", async (req, res, next) => {
  try {
    const { sessionId, message } = req.body as { sessionId?: string; message?: string };
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const store = getDefaultAgentStore();
    const session = store.getOrCreate(sessionId);

    const extracted = await runtime.extractor.extract(message, session.state);
    const { state, notes } = applyExtracted(session.state, extracted);
    session.state = state;

    if (!isComplete(state)) {
      session.status = "intake";
      return res.json({
        sessionId: session.id,
        status: "intake",
        missingFields: requiredFieldGaps(state),
        reply: [nextQuestion(state), ...notes].filter(Boolean).join(" "),
        state,
      });
    }

    // Complete → geocode (if needed) then run the pipeline.
    if (state.lat == null || state.lon == null) {
      const geo = await runTraced(
        session.writer,
        { toolName: "geocode_location", purpose: "normalize.location", parameters: { text: state.locationText ?? state.district } },
        () => runtime.geocode(state.locationText ?? state.district!),
      );
      state.lat = geo.result.lat;
      state.lon = geo.result.lon;
      state.district ??= geo.result.admin1;
    }

    const profile: OrchestratorProfile = {
      ...state,
      district: state.district!,
      areaHa: state.areaHa!,
      soilTexture: state.soilTexture as SoilTexture,
      waterAvailability: state.waterAvailability as WaterAvailability,
      budgetBdt: state.budgetBdt!,
      targetSeason: state.targetSeason as Season,
      fertilityClass: (state.fertilityClass as FertilityClass) ?? "medium",
    };

    const result = await runPipeline(profile, {
      writer: session.writer,
      getForecast: () => runtime.getForecast(profile.lat!, profile.lon!),
      getNormals: (months) => runtime.getNormals(profile.lat!, profile.lon!, months),
      resolvePrice: (cropId) =>
        runtime.resolvePrice(cropId, {
          district: profile.district,
          farmLat: profile.lat ?? undefined,
          farmLon: profile.lon ?? undefined,
        }),
      chosenCropId: state.currentCrop,
    });
    session.result = result;
    session.status = "complete";

    const top = result.ranking.slice(0, 3).map((r) => ({
      cropId: r.cropId,
      score: r.score,
      roughProfitBdt: r.roughProfitBdt,
      reasons: r.reasons,
    }));

    return res.json({
      sessionId: session.id,
      status: "complete",
      reply: result.basis,
      chosen: result.chosen,
      topCandidates: top,
      plan: result.plan,
      financials: result.financials,
      numbers: result.numbers,
      weatherAvailable: result.weatherAvailable,
    });
  } catch (err) {
    next(err);
    return;
  }
});

agentRouter.get("/sessions/:id/trace", (req, res) => {
  const session = getDefaultAgentStore().get(req.params.id);
  if (!session) return res.status(404).json({ error: "session not found" });
  return res.json({
    sessionId: session.id,
    status: session.status,
    events: session.writer.events,
  });
});
