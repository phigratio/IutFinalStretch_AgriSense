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
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { observabilityMiddleware } from "./middleware/observability.js";

export function createApp(): Application {
  const app = express();

  app.use(express.json());
  app.use(observabilityMiddleware);

  app.use("/health", healthRouter);
  app.use("/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/agent", agentIntakeRouter);
  app.use("/api/agrisense", agrisenseRouter);
  // bdapps CaaS checkout + receipt readback (payments/service.ts).
  app.use("/api/payments", paymentsRouter);

  // BDApps webhooks — register these URLs in provisioning (BDApps -> you).
  app.use("/bdapps", bdappsListenerRouter);
  // BDApps test triggers — call from Postman/curl to fire the APIs (you -> BDApps).
  app.use("/api/bdapps", bdappsTestRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
