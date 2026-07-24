import { AuthService } from "./auth/service.js";
import { getDefaultAuthStore } from "./auth/store.js";
import { assertProductionConfig } from "./config.js";
import { startTelemetry, shutdownTelemetry } from "./telemetry.js";
import { createApp } from "./app.js";
import { startKbIngestionWorker, stopKbIngestionWorker } from "./kb/ingestionJobs.js";

const PORT = Number(process.env.PORT) || 3000;

assertProductionConfig();
startTelemetry();
await new AuthService(getDefaultAuthStore()).initialize();
await startKbIngestionWorker();

const app = createApp();

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const shutdown = async () => {
  await stopKbIngestionWorker();
  await shutdownTelemetry();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});

process.on("SIGTERM", () => {
  void shutdown();
});
