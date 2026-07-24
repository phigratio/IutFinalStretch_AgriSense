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
          sessionId: req.body.sessionId,
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const marketplaceRouter = createMarketplaceRouter();
