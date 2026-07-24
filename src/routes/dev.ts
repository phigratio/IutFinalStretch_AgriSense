/**
 * Dev/demo triggers for BDApps proactive alerts (P2). Lets us create a demo
 * alert and push pending alerts by SMS on demand — for the live demo and for
 * testing without waiting on the Temporal schedule. Dev-only; mounted under
 * /api/dev. NOT for production.
 *   POST /api/dev/seed-demo-alert  { mobile, location?, title?, message?, recommendation? }
 *   POST /api/dev/deliver-alerts   -> delivers pending alerts, returns a summary
 */
import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { deliverPendingAlerts } from "../notifications/smsDispatcher.js";

function prisma(): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl! }) });
}

export const devRouter = Router();

/** Create a demo farmer (by mobile) + farm + a pending weather alert. */
devRouter.post("/seed-demo-alert", async (req: Request, res: Response): Promise<void> => {
  const mobile = String(req.body?.mobile ?? "").trim();
  if (mobile === "") {
    res.status(400).json({ error: "mobile is required" });
    return;
  }
  const db = prisma();
  try {
    const farmer =
      (await db.farmerProfile.findFirst({ where: { bdappsMobile: mobile } })) ??
      (await db.farmerProfile.create({ data: { bdappsMobile: mobile, preferredName: "Demo Farmer" } }));

    const farm =
      (await db.farmProfile.findFirst({ where: { farmerId: farmer.id } })) ??
      (await db.farmProfile.create({
        data: {
          farmerId: farmer.id,
          locationText: String(req.body?.location ?? "Bogura"),
          sizeAcres: 2,
          soilType: "sandy loam",
          waterAvailability: "tubewell",
          budgetBdt: 40000,
          targetSeason: "Boro",
        },
      }));

    const alert = await db.proactiveAlert.create({
      data: {
        farmId: farm.id,
        alertType: "heavy_rain",
        severity: "warning",
        title: String(req.body?.title ?? "Heavy rain risk"),
        message: String(req.body?.message ?? "34mm rain is forecast in the next 4 days."),
        recommendation: String(req.body?.recommendation ?? "Delay your urea top-dress until after the rain."),
        ruleId: "demo.seed",
        fingerprint: `demo:${randomUUID()}`,
      },
    });

    res.status(201).json({ farmerId: farmer.id, farmId: farm.id, alertId: alert.id });
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  } finally {
    await db.$disconnect();
  }
});

/** Deliver all pending alerts by SMS. */
devRouter.post("/deliver-alerts", async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await deliverPendingAlerts({ limit: Number(req.body?.limit) || 20 });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});
