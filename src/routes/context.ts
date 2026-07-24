import { Router, type Request, type Response } from "express";
import { contextHydrator, type ContextHydrator } from "../context/contextService.js";
import { normalizeLanguage } from "../language/localization.js";

export function createContextRouter(service: ContextHydrator = contextHydrator): Router {
  const router = Router();

  router.get("/", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await service.hydrate(parseContextQuery(req)));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/refresh", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await service.hydrate({
        message: asString(req.body.message),
        userId: asString(req.body.userId),
        tenantId: asString(req.body.tenantId),
        farmerId: asString(req.body.farmerId),
        farmId: asString(req.body.farmId),
        sessionId: asString(req.body.sessionId),
        bdappsMobile: asString(req.body.bdappsMobile),
        language: normalizeLanguage(req.body.language),
        cropId: asString(req.body.cropId),
        refresh: true,
        limit: numberValue(req.body.limit),
      }));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

function parseContextQuery(req: Request) {
  return {
    message: asString(req.query.message),
    userId: asString(req.query.userId),
    tenantId: asString(req.query.tenantId),
    farmerId: asString(req.query.farmerId),
    farmId: asString(req.query.farmId),
    sessionId: asString(req.query.sessionId),
    bdappsMobile: asString(req.query.bdappsMobile),
    language: normalizeLanguage(asString(req.query.language)),
    cropId: asString(req.query.cropId),
    refresh: asString(req.query.refresh) === "true",
    limit: numberValue(req.query.limit),
  };
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const contextRouter = createContextRouter();
