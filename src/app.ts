import express, { type Application } from "express";
import { healthRouter } from "./routes/health.js";
import { usersRouter } from "./routes/users.js";
import { statsRouter } from "./routes/stats.js";
import { authRouter } from "./routes/auth.js";
import { bdappsListenerRouter } from "./routes/bdappsListeners.js";
import { bdappsTestRouter } from "./routes/bdappsTest.js";
import { agentIntakeRouter } from "./routes/agentIntake.js";
import { agrisenseRouter } from "./routes/agrisense.js";
import { paymentsRouter } from "./routes/payments.js";
import { channelRouter } from "./routes/channel.js";
import { devRouter } from "./routes/dev.js";
import { temporalRouter } from "./routes/temporal.js";
import { marketplaceRouter } from "./routes/marketplace.js";
import { financeRouter } from "./routes/finance.js";
import { contextRouter } from "./routes/context.js";
import { pestRiskRouter } from "./routes/pestRisk.js";
import { voiceRouter } from "./routes/voice.js";
// NOTE: parallel Tier 0 implementation (navid) — mounted under /api/tier0 to avoid
// colliding with agrisenseRouter/agentIntakeRouter. Team to pick one before submission.
import { agentRouter } from "./routes/agent.js";
import { kbRouter } from "./routes/kb.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { tenantsRouter } from "./routes/tenants.js";
import { hubRouter } from "./routes/hub.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { observabilityMiddleware } from "./middleware/observability.js";

export function createApp(): Application {
  const app = express();

  app.use(express.json());
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const elapsedMs = Date.now() - startedAt;
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs}ms`);
    });
    next();
  });
  app.use(observabilityMiddleware);

  // CORS for the mobile app's web build (Expo web on :8081 calling us on :3000).
  // Native apps don't enforce CORS; browsers do. Open policy is fine for a
  // hackathon demo backend with no cookies/session auth on these routes.
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Id");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/agent", agentIntakeRouter);
  app.use("/api/agrisense", agrisenseRouter);
  app.use("/api/context", contextRouter);
  app.use("/api/temporal", temporalRouter);
  app.use("/api/marketplace", marketplaceRouter);
  app.use("/api/finance", financeRouter);
  app.use("/api/pest-risk", pestRiskRouter);
  app.use("/api/voice", voiceRouter);
  // bdapps CaaS checkout + receipt readback (payments/service.ts).
  app.use("/api/payments", paymentsRouter);
  // BDApps channel-activation status (can we reach this farmer via BDApps?).
  app.use("/api/channel", channelRouter);
  // Dev/demo triggers for proactive-alert SMS (dev-only).
  app.use("/api/dev", devRouter);
  // Parallel Tier 0 pipeline (navid): /api/tier0/agent/message, /api/tier0/sessions/:id/trace.
  app.use("/api/tier0", agentRouter);
  // Multi-tenant knowledge base (navid/kb): prices resolve tenant-over-hub with provenance.
  app.use("/api/kb", kbRouter);
  // Role-based onboarding (navid): user / admin / tenant flows.
  app.use("/api", onboardingRouter);
  app.use("/api/tenants", tenantsRouter);
  app.use("/api/hub", hubRouter);

  // BDApps webhooks — register these URLs in provisioning (BDApps -> you).
  app.use("/bdapps", bdappsListenerRouter);
  // BDApps test triggers — call from Postman/curl to fire the APIs (you -> BDApps).
  app.use("/api/bdapps", bdappsTestRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
