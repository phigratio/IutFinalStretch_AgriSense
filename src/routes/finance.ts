import { Router, type Request, type Response } from "express";
import { financeService, FinanceService } from "../finance/financeService.js";
import { type FinanceEntryType, type FinanceSummaryQuery } from "../finance/types.js";

export function createFinanceRouter(service: FinanceService = financeService): Router {
  const router = Router();

  router.get("/summary", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await service.getSummary(parseSummaryQuery(req)));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get("/entries", async (req: Request, res: Response): Promise<void> => {
    try {
      res.json(await service.listEntries({
        ...parseSummaryQuery(req),
        type: parseEntryType(req.query.type),
      }));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/entries", async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(201).json(await service.createEntry({
        farmId: req.body.farmId,
        seasonPlanId: req.body.seasonPlanId,
        entryType: req.body.entryType,
        category: req.body.category,
        label: req.body.label,
        amountBdt: Number(req.body.amountBdt),
        entryDate: req.body.entryDate,
        season: req.body.season,
        crop: req.body.crop,
        metadata: req.body.metadata,
      }));
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.patch("/entries/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const updated = await service.updateEntry(String(req.params.id), {
        farmId: req.body.farmId,
        seasonPlanId: req.body.seasonPlanId,
        entryType: req.body.entryType,
        category: req.body.category,
        label: req.body.label,
        amountBdt: req.body.amountBdt === undefined ? undefined : Number(req.body.amountBdt),
        entryDate: req.body.entryDate,
        season: req.body.season,
        crop: req.body.crop,
        metadata: req.body.metadata,
      });
      if (!updated) {
        res.status(404).json({ error: "Finance entry not found" });
        return;
      }
      res.json(updated);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.delete("/entries/:id", async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await service.deleteEntry(String(req.params.id));
      if (!deleted) {
        res.status(404).json({ error: "Finance entry not found" });
        return;
      }
      res.status(204).send();
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.post("/advice", async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await service.getSummary({
        userId: req.body.userId,
        tenantId: req.body.tenantId,
        farmerId: req.body.farmerId,
        farmId: req.body.farmId,
        seasonPlanId: req.body.seasonPlanId,
        sessionId: req.body.sessionId,
        year: req.body.year === undefined ? undefined : Number(req.body.year),
        season: req.body.season,
      });
      res.json({
        agentInsights: summary.agentInsights,
        trace: summary.trace,
        totals: summary.totals,
      });
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

function parseSummaryQuery(req: Request): FinanceSummaryQuery {
  return {
    userId: asString(req.query.userId),
    tenantId: asString(req.query.tenantId),
    farmerId: asString(req.query.farmerId),
    farmId: asString(req.query.farmId),
    seasonPlanId: asString(req.query.seasonPlanId),
    sessionId: asString(req.query.sessionId),
    year: req.query.year === undefined ? undefined : Number(req.query.year),
    season: asString(req.query.season),
  };
}

function parseEntryType(value: unknown): FinanceEntryType | undefined {
  const type = asString(value);
  if (!type) return undefined;
  if (type !== "income" && type !== "expense") throw new Error("type must be income or expense");
  return type;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export const financeRouter = createFinanceRouter();
