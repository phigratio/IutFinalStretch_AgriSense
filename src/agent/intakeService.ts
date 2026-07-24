/**
 * T0-1 intake orchestration: load memory/profile, extract facts, merge, persist,
 * compute deterministic gaps, and produce a targeted farmer-facing reply.
 */
import { HeuristicIntakeExtractor, OpenAiIntakeExtractor, type IntakeExtractor } from "./extractIntakeProfile.js";
import { getDefaultIntakeStore, type IntakeStore } from "./intakeStore.js";
import { type IntakeRequest, type IntakeTraceEvent, type IntakeTurnResult } from "./intakeSchema.js";
import { mergeProfilePatch, requiredFieldGaps } from "./requiredFieldGaps.js";

export class IntakeService {
  constructor(
    private readonly store: IntakeStore = getDefaultIntakeStore(),
    private readonly extractor: IntakeExtractor = new OpenAiIntakeExtractor(),
  ) {}

  async handleTurn(request: IntakeRequest): Promise<IntakeTurnResult> {
    if (!request.message?.trim()) {
      throw new Error("message is required");
    }

    const trace: IntakeTraceEvent[] = [];
    let profile = await this.store.loadOrCreate({
      sessionId: request.sessionId,
      farmerId: request.farmerId,
      farmId: request.farmId,
      bdappsMobile: request.bdappsMobile,
      channel: request.channel,
    });

    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "memory.search",
      parameters: { sessionId: profile.sessionId, farmerId: profile.farmerId, farmId: profile.farmId },
      rawResponse: { profile },
      status: "success",
      latencyMs: 0,
    });

    const started = Date.now();
    let patch;
    try {
      patch = await this.extractor.extract(request.message, profile);
      await this.trace(profile.sessionId!, trace, {
        kind: "tool",
        toolName: "extract_intake_profile",
        parameters: { message: request.message, currentProfile: profile },
        rawResponse: { profilePatch: patch },
        status: "success",
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      const fallback = new HeuristicIntakeExtractor();
      patch = await fallback.extract(request.message, profile);
      await this.trace(profile.sessionId!, trace, {
        kind: "error",
        toolName: "extract_intake_profile",
        parameters: { message: request.message },
        rawResponse: { fallbackPatch: patch },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - started,
      });
    }

    const merged = mergeProfilePatch(profile, patch);
    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "profile.merge",
      parameters: { before: profile, patch },
      rawResponse: { profile: merged },
      status: "success",
      latencyMs: 0,
    });

    const missingFields = requiredFieldGaps(merged);
    const intakeComplete = missingFields.length === 0;
    profile = await this.store.saveProfile(merged, missingFields, intakeComplete ? "intake_complete" : "intake");

    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "requiredFieldGaps",
      parameters: { profile },
      rawResponse: { missingFields },
      status: "success",
      latencyMs: 0,
    });

    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "save_farm_profile",
      parameters: { farmId: profile.farmId, farmerId: profile.farmerId },
      rawResponse: { profile },
      status: "success",
      latencyMs: 0,
    });

    return {
      sessionId: profile.sessionId!,
      farmerId: profile.farmerId!,
      farmId: profile.farmId!,
      profile,
      missingFields,
      intakeComplete,
      reply: intakeComplete ? buildCompleteReply(profile) : buildFollowUpReply(profile, missingFields),
      trace,
      nextStep: intakeComplete
        ? {
            name: "weather_and_crop_planning",
            plannedTools: ["geocode_location", "get_weather", "query_knowledge_base", "rank_crops"],
          }
        : undefined,
    };
  }

  private async trace(sessionId: string, trace: IntakeTraceEvent[], event: IntakeTraceEvent): Promise<void> {
    trace.push(event);
    await this.store.saveTrace(sessionId, event);
  }
}

function buildFollowUpReply(profile: { locationText?: string; sizeAcres?: number; soilType?: string; waterAvailability?: string; budgetBdt?: number; targetSeason?: string }, missingFields: string[]): string {
  const known = [
    profile.locationText ? `location ${profile.locationText}` : undefined,
    profile.sizeAcres ? `${profile.sizeAcres} acre farm size` : undefined,
    profile.soilType ? `${profile.soilType} soil` : undefined,
    profile.waterAvailability ? `${profile.waterAvailability} water` : undefined,
    profile.budgetBdt ? `৳${profile.budgetBdt} budget` : undefined,
    profile.targetSeason ? `${profile.targetSeason} season` : undefined,
  ].filter(Boolean);

  const questions = missingFields.map(labelGap).join(", ");
  if (known.length === 0) {
    return `I can help plan the season. Please tell me ${questions}.`;
  }

  return `Got it: ${known.join(", ")}. Please tell me ${questions}.`;
}

function buildCompleteReply(profile: { locationText?: string; sizeAcres?: number; soilType?: string; waterAvailability?: string; budgetBdt?: number; targetSeason?: string }): string {
  return [
    "Intake complete.",
    `I have ${profile.locationText}, ${profile.sizeAcres} acres, ${profile.soilType} soil, ${profile.waterAvailability} water, ৳${profile.budgetBdt} budget, and ${profile.targetSeason} season.`,
    "Next I will geocode the location, fetch live weather, search the crop knowledge base, and rank crops.",
  ].join(" ");
}

function labelGap(gap: string): string {
  switch (gap) {
    case "location":
      return "where the land is";
    case "farmSize":
      return "how large the farm is";
    case "soilType":
      return "the soil type";
    case "waterAvailability":
      return "the water source or availability";
    case "budget":
      return "your budget in BDT";
    case "targetSeason":
      return "the target season";
    default:
      return gap;
  }
}

export const intakeService = new IntakeService();

