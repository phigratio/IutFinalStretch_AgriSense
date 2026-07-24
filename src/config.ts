export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL,
  authTokenSecret: process.env.AUTH_TOKEN_SECRET ?? "dev-only-change-this-auth-secret",
  authTokenTtlSeconds: Number(process.env.AUTH_TOKEN_TTL_SECONDS) || 60 * 60,
  cookieSecure: process.env.COOKIE_SECURE === "true",
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ?? "http://localhost:3000/auth/google/callback",
  frontendAuthSuccessUrl: process.env.FRONTEND_AUTH_SUCCESS_URL,
  mem0ApiUrl: process.env.MEM0_API_URL ?? "http://mem0-api:8000",
  mem0ApiKey: process.env.MEM0_API_KEY,
  mem0PersistenceEnabled: process.env.MEM0_PERSISTENCE_ENABLED === "true",
  ragEmbeddingDimensions: Number(process.env.RAG_EMBEDDING_DIMENSIONS) || 1536,
  // Agent LLM — OpenAI is the sole provider for agent chat (D3). Embeddings go via mem0.
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiChatModel: process.env.OPENAI_CHAT_MODEL ?? "gpt-4o",
  openaiIntakeModel: process.env.OPENAI_INTAKE_MODEL ?? "gpt-4.1-mini",
  openaiSttModel: process.env.OPENAI_STT_MODEL ?? "whisper-1",
  // Fixed global identity for the shared agronomy knowledge base in mem0.
  mem0KbUserId: process.env.MEM0_KB_USER_ID ?? "agrisense-kb",
  mem0KbAgentId: process.env.MEM0_KB_AGENT_ID ?? "agrisense-kb",
  // Cloudinary — used to host KB illustration images surfaced with retrieval hits.
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME,
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY,
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET,
  // BDApps premium gating (P6): when true, proactive-alert SMS only goes to
  // subscribed (premium) farmers — subscription unlocks the alert channel.
  // Default false so free farmers with an active channel still get alerts.
  alertsRequirePremium: process.env.ALERTS_REQUIRE_PREMIUM === "true",
};

export function assertProductionConfig(): void {
  if (config.nodeEnv !== "production") {
    return;
  }

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required in production");
  }

  if (config.authTokenSecret.length < 32 || config.authTokenSecret.includes("dev-only")) {
    throw new Error("AUTH_TOKEN_SECRET must be a strong secret in production");
  }
}
