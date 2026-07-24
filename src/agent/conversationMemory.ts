import { config } from "../config.js";
import { buildMultilingualQuery, type SupportedLanguage } from "../language/localization.js";
import { mem0Client, type Mem0Client } from "../rag/mem0Client.js";
import { type IntakeField, type IntakeProfile, type IntakeProfilePatch } from "./intakeSchema.js";

export interface RememberIntakeTurnInput {
  message: string;
  reply: string;
  profile: IntakeProfile;
  profilePatch: IntakeProfilePatch;
  missingFields: IntakeField[];
  intakeComplete: boolean;
  language: SupportedLanguage;
  userId?: string;
  tenantId?: string;
  channel?: string;
}

export interface ConversationMemory {
  rememberIntakeTurn(input: RememberIntakeTurnInput): Promise<unknown>;
}

export class NoopConversationMemory implements ConversationMemory {
  async rememberIntakeTurn(input: RememberIntakeTurnInput): Promise<unknown> {
    return {
      skipped: true,
      reason: "MEM0_PERSISTENCE_ENABLED is not true",
      memoryUserId: resolveMemoryUserId(input),
    };
  }
}

export class Mem0ConversationMemory implements ConversationMemory {
  constructor(private readonly client: Mem0Client = mem0Client) {}

  async rememberIntakeTurn(input: RememberIntakeTurnInput): Promise<unknown> {
    const memoryUserId = resolveMemoryUserId(input);
    const normalizedMessage = buildMultilingualQuery(input.message);

    return this.client.add({
      userId: memoryUserId,
      agentId: "agrisense-intake",
      runId: input.profile.sessionId,
      messages: [
        { role: "user", content: input.message },
        { role: "assistant", content: input.reply },
      ],
      infer: false,
      metadata: {
        memoryUserId,
        tenantId: input.tenantId,
        appUserId: input.userId,
        farmerId: input.profile.farmerId,
        farmId: input.profile.farmId,
        sessionId: input.profile.sessionId,
        bdappsMobile: input.profile.bdappsMobile,
        channel: input.channel ?? "web",
        language: input.language,
        normalizedMessage,
        extractedVariables: input.profilePatch,
        missingFields: input.missingFields,
        intakeComplete: input.intakeComplete,
        profileSnapshot: input.profile,
        source: "agrisense-intake",
      },
    });
  }
}

function resolveMemoryUserId(input: Pick<RememberIntakeTurnInput, "userId" | "tenantId" | "profile">): string {
  return input.userId ?? input.tenantId ?? input.profile.farmerId ?? input.profile.sessionId ?? "anonymous";
}

let defaultConversationMemory: ConversationMemory | undefined;

export function getDefaultConversationMemory(): ConversationMemory {
  defaultConversationMemory ??= config.mem0PersistenceEnabled
    ? new Mem0ConversationMemory()
    : new NoopConversationMemory();
  return defaultConversationMemory;
}
