/**
 * T0-1 intake orchestration: load memory/profile, extract facts, merge, persist,
 * compute deterministic gaps, and produce a targeted farmer-facing reply.
 */
import { HeuristicIntakeExtractor, OpenAiIntakeExtractor, type IntakeExtractor } from "./extractIntakeProfile.js";
import { getDefaultConversationMemory, type ConversationMemory } from "./conversationMemory.js";
import { getDefaultIntakeStore, type IntakeStore } from "./intakeStore.js";
import { type IntakeRequest, type IntakeTraceEvent, type IntakeTurnResult } from "./intakeSchema.js";
import { detectInputLanguage, localizeCompleteReply, localizeFollowUpReply, normalizeLanguage } from "../language/localization.js";
import { mergeProfilePatch, requiredFieldGaps } from "./requiredFieldGaps.js";

export class IntakeService {
  constructor(
    private readonly store: IntakeStore = getDefaultIntakeStore(),
    private readonly extractor: IntakeExtractor = new OpenAiIntakeExtractor(),
    private readonly memory: ConversationMemory = getDefaultConversationMemory(),
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
      preferredLanguage: request.preferredLanguage,
    });
    const detectedLanguage = detectInputLanguage(
      request.message,
      request.preferredLanguage ?? profile.preferredLanguage,
    );

    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "memory.search",
      parameters: { sessionId: profile.sessionId, farmerId: profile.farmerId, farmId: profile.farmId },
      rawResponse: { profile },
      status: "success",
      latencyMs: 0,
    });

    await this.trace(profile.sessionId!, trace, {
      kind: "tool",
      toolName: "language.detect",
      parameters: { message: request.message, requestedLanguage: request.preferredLanguage, storedLanguage: profile.preferredLanguage },
      rawResponse: { detectedLanguage },
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

    patch.preferredLanguage = normalizeLanguage(patch.preferredLanguage) ?? detectedLanguage;

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

    const reply = intakeComplete
      ? localizeCompleteReply(profile, profile.preferredLanguage ?? detectedLanguage)
      : localizeFollowUpReply(profile, missingFields, profile.preferredLanguage ?? detectedLanguage);

    const memoryStarted = Date.now();
    try {
      const memoryResult = await this.memory.rememberIntakeTurn({
        message: request.message,
        reply,
        profile,
        profilePatch: patch,
        missingFields,
        intakeComplete,
        language: profile.preferredLanguage ?? detectedLanguage,
        userId: request.userId,
        tenantId: request.tenantId,
        channel: request.channel,
      });
      await this.trace(profile.sessionId!, trace, {
        kind: "tool",
        toolName: "mem0.memory.add",
        parameters: {
          userId: request.userId,
          tenantId: request.tenantId,
          farmerId: profile.farmerId,
          sessionId: profile.sessionId,
          language: profile.preferredLanguage ?? detectedLanguage,
        },
        rawResponse: memoryResult,
        status: "success",
        latencyMs: Date.now() - memoryStarted,
      });
    } catch (error) {
      await this.trace(profile.sessionId!, trace, {
        kind: "error",
        toolName: "mem0.memory.add",
        parameters: {
          userId: request.userId,
          tenantId: request.tenantId,
          farmerId: profile.farmerId,
          sessionId: profile.sessionId,
          language: profile.preferredLanguage ?? detectedLanguage,
        },
        rawResponse: { persisted: false },
        status: "error",
        errorMessage: (error as Error).message,
        latencyMs: Date.now() - memoryStarted,
      });
    }

    return {
      sessionId: profile.sessionId!,
      farmerId: profile.farmerId!,
      farmId: profile.farmId!,
      profile,
      missingFields,
      intakeComplete,
      reply,
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

export const intakeService = new IntakeService();
