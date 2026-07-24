/**
 * AgriSense API routes for sessions, message orchestration, trace readback,
 * and generated plan readback. bdapps/KB stay in separate teammate modules.
 */
import { Router, type Request, type Response } from "express";
import { agriSenseService, AgriSenseService } from "../agrisense/agrisenseService.js";

export function createAgriSenseRouter(service: AgriSenseService = agriSenseService): Router {
  const router = Router();

  router.post("/sessions", async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(201).json(
        await service.startSession({
          sessionId: req.body.sessionId,
          userId: req.body.userId,
          tenantId: req.body.tenantId,
          farmerId: req.body.farmerId,
          farmId: req.body.farmId,
          bdappsMobile: req.body.bdappsMobile,
          channel: req.body.channel ?? "web",
          preferredLanguage: req.body.preferredLanguage,
          selectedCrop: req.body.selectedCrop,
          workflowStage: req.body.workflowStage,
          triggerReason: req.body.triggerReason,
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/message", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.handleMessage({
          message: req.body.message,
          sessionId: req.body.sessionId,
          userId: req.body.userId,
          tenantId: req.body.tenantId,
          farmerId: req.body.farmerId,
          farmId: req.body.farmId,
          bdappsMobile: req.body.bdappsMobile,
          channel: req.body.channel ?? "web",
          preferredLanguage: req.body.preferredLanguage,
          selectedCrop: req.body.selectedCrop,
          workflowStage: req.body.workflowStage,
          triggerReason: req.body.triggerReason,
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/workflow", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(
        await service.handleMessage({
          message: req.body.message ?? "recalculate season plan",
          sessionId: req.body.sessionId,
          userId: req.body.userId,
          tenantId: req.body.tenantId,
          farmerId: req.body.farmerId,
          farmId: req.body.farmId,
          bdappsMobile: req.body.bdappsMobile,
          channel: req.body.channel ?? "web",
          preferredLanguage: req.body.preferredLanguage,
          selectedCrop: req.body.selectedCrop,
          workflowStage: req.body.workflowStage ?? "full",
          triggerReason: req.body.triggerReason ?? "user_requested_replan",
        }),
      );
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/sessions/:sessionId/trace", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await service.listTrace(String(req.params.sessionId)));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/plans/:planId", async (req: Request, res: Response): Promise<void> => {
    try {
      const plan = await service.getPlan(String(req.params.planId));
      if (!plan) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }
      res.json(plan);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const agrisenseRouter = createAgriSenseRouter();
