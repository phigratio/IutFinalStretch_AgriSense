import { context, metrics, trace } from "@opentelemetry/api";
import { SeverityNumber } from "@opentelemetry/api-logs";
import type { RequestHandler } from "express";
import { appLogger } from "../telemetry.js";

const meter = metrics.getMeter("iut-ict-fest-backend");
const requestCounter = meter.createCounter("http.server.requests", {
  description: "Total HTTP requests handled by the Express app.",
});
const requestDuration = meter.createHistogram("http.server.request.duration.ms", {
  description: "HTTP request duration in milliseconds.",
  unit: "ms",
});

export const observabilityMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const activeContext = context.active();
    const span = trace.getSpan(activeContext);
    const spanContext = span?.spanContext();
    const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : req.path;
    const attributes = {
      "http.request.method": req.method,
      "http.route": route,
      "http.response.status_code": res.statusCode,
    };

    requestCounter.add(1, attributes);
    requestDuration.record(durationMs, attributes);

    appLogger.emit({
      context: activeContext,
      severityNumber: res.statusCode >= 500 ? SeverityNumber.ERROR : SeverityNumber.INFO,
      severityText: res.statusCode >= 500 ? "ERROR" : "INFO",
      body: "http request completed",
      attributes: {
        ...attributes,
        "http.request.duration_ms": durationMs,
        "url.path": req.path,
        "url.query": req.url.includes("?") ? req.url.split("?").slice(1).join("?") : "",
        "user_agent.original": req.get("user-agent") ?? "",
        "client.address": req.ip ?? "",
        "trace.id": spanContext?.traceId ?? "",
        "span.id": spanContext?.spanId ?? "",
      },
    });
  });

  next();
};
