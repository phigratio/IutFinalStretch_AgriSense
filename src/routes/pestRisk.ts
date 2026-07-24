import { Router, type Request, type Response } from "express";
import { pestRiskService, PestRiskService } from "../pest/pestRiskService.js";

export function createPestRiskRouter(service: PestRiskService = pestRiskService): Router {
  const router = Router();

  router.post("/assess", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.assess({
          cropId: req.body.cropId,
          crop: req.body.crop,
          growthStage: req.body.growthStage,
          daysAfterSowing: optionalNumber(req.body.daysAfterSowing),
          areaAcres: optionalNumber(req.body.areaAcres),
          locationText: req.body.locationText,
          latitude: optionalNumber(req.body.latitude),
          longitude: optionalNumber(req.body.longitude),
          farmerId: req.body.farmerId,
          farmId: req.body.farmId,
          sessionId: req.body.sessionId,
          planId: req.body.planId,
          save: req.body.save,
          createAlerts: req.body.createAlerts,
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/assessments", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.listAssessments({
          farmId: stringQuery(req.query.farmId),
          planId: stringQuery(req.query.planId),
          limit: optionalNumber(req.query.limit),
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const pestRiskRouter = createPestRiskRouter();

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
