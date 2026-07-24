import { Router, type Request, type Response } from "express";
import { marketplaceService, MarketplaceService } from "../marketplace/marketplaceService.js";

export function createMarketplaceRouter(service: MarketplaceService = marketplaceService): Router {
  const router = Router();

  router.post("/intelligence", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.getIntelligence({
          itemName: req.body.itemName,
          quantity: Number(req.body.quantity),
          unit: req.body.unit,
          district: req.body.district,
          latitude: req.body.latitude === undefined ? undefined : Number(req.body.latitude),
          longitude: req.body.longitude === undefined ? undefined : Number(req.body.longitude),
          crop: req.body.crop,
          userId: req.body.userId,
          tenantId: req.body.tenantId,
          farmerId: req.body.farmerId,
          farmId: req.body.farmId,
          sessionId: req.body.sessionId,
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/runs", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.listRuns({
          userId: stringQuery(req.query.userId),
          tenantId: stringQuery(req.query.tenantId),
          farmerId: stringQuery(req.query.farmerId),
          farmId: stringQuery(req.query.farmId),
          sessionId: stringQuery(req.query.sessionId),
          limit: optionalNumber(req.query.limit),
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/runs/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const run = await service.getRun(String(req.params.id));
      if (!run) {
        res.status(404).json({ error: "Marketplace comparison run not found" });
        return;
      }
      res.json(run);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const marketplaceRouter = createMarketplaceRouter();

function optionalNumber(value: unknown): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === "") return undefined;
  const parsed = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringQuery(value: unknown): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}
