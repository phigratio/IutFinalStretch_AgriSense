import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

const serviceName = process.env.OTEL_SERVICE_NAME ?? "iut-ict-fest-backend";
const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4317";

if (process.env.OTEL_LOG_LEVEL) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

export const telemetrySdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
  }),
  traceExporter: new OTLPTraceExporter({
    url: otlpEndpoint,
  }),
  metricReaders: [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({
        url: otlpEndpoint,
      }),
      exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL_MS) || 15000,
    }),
  ],
  logRecordProcessors: [
    new BatchLogRecordProcessor({
      exporter: new OTLPLogExporter({
        url: otlpEndpoint,
      }),
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
    }),
  ],
});

export const appLogger = logs.getLogger(serviceName);

export function startTelemetry(): void {
  telemetrySdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await telemetrySdk.shutdown();
}
