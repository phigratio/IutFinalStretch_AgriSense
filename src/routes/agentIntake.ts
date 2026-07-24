/**
 * T0-1 conversational intake endpoint for AgriSense. It collects the six
 * required farm fields and returns judge-visible trace events.
 */
import { Router, type Request, type Response } from "express";
import { IntakeService } from "../agent/intakeService.js";
import { intakeService as defaultIntakeService } from "../agent/intakeService.js";

export function createAgentIntakeRouter(service: IntakeService = defaultIntakeService): Router {
  const router = Router();

  router.post("/intake", async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await service.handleTurn({
        message: req.body.message,
        sessionId: req.body.sessionId,
        userId: req.body.userId,
        tenantId: req.body.tenantId,
        farmerId: req.body.farmerId,
        farmId: req.body.farmId,
        bdappsMobile: req.body.bdappsMobile,
        channel: req.body.channel ?? "web",
        preferredLanguage: req.body.preferredLanguage,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const agentIntakeRouter = createAgentIntakeRouter();
