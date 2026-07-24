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
  ragEmbeddingDimensions: Number(process.env.RAG_EMBEDDING_DIMENSIONS) || 1536,
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
