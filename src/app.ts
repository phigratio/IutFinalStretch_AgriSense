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
import { temporalRouter } from "./routes/temporal.js";
import { marketplaceRouter } from "./routes/marketplace.js";
// NOTE: parallel Tier 0 implementation (navid) — mounted under /api/tier0 to avoid
// colliding with agrisenseRouter/agentIntakeRouter. Team to pick one before submission.
import { agentRouter } from "./routes/agent.js";
import { kbRouter } from "./routes/kb.js";
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
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
  app.use("/api/temporal", temporalRouter);
  app.use("/api/marketplace", marketplaceRouter);
  // bdapps CaaS checkout + receipt readback (payments/service.ts).
  app.use("/api/payments", paymentsRouter);
  // Parallel Tier 0 pipeline (navid): /api/tier0/agent/message, /api/tier0/sessions/:id/trace.
  app.use("/api/tier0", agentRouter);
  // Multi-tenant knowledge base (navid/kb): prices resolve tenant-over-hub with provenance.
  app.use("/api/kb", kbRouter);

  // BDApps webhooks — register these URLs in provisioning (BDApps -> you).
  app.use("/bdapps", bdappsListenerRouter);
  // BDApps test triggers — call from Postman/curl to fire the APIs (you -> BDApps).
  app.use("/api/bdapps", bdappsTestRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
