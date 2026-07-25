import type { ErrorRequestHandler } from "express";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  const status = statusFromError(err);
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: messageFromError(err) });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
};

function statusFromError(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const candidate = (err as { status?: unknown; statusCode?: unknown }).status ?? (err as { statusCode?: unknown }).statusCode;
  return typeof candidate === "number" ? candidate : undefined;
}

function messageFromError(err: unknown): string {
  if (!err || typeof err !== "object") return "Request failed";
  const message = (err as { message?: unknown }).message;
  return typeof message === "string" && message ? message : "Request failed";
}
