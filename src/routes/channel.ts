/**
 * Channel status API — lets the app ask "can BDApps reach this farmer, and are
 * they premium?" before offering an SMS/alert/payment feature (channel
 * activation gating, see docs/plans/BDAPPS-INTEGRATION-PLAN.md §1a/§7).
 *   GET  /api/channel/status?mobile=018...   -> ChannelStatus
 * (mobile is explicit for now; once BDApps login lands it derives from the
 * authenticated farmer's FarmerProfile.)
 */
import { Router, type Request, type Response } from "express";
import { getDefaultChannelStore, type ChannelStore } from "../bdapps/channel.js";

export function createChannelRouter(store: ChannelStore = getDefaultChannelStore()): Router {
  const router = Router();

  router.get("/status", async (req: Request, res: Response): Promise<void> => {
    const mobile = typeof req.query.mobile === "string" ? req.query.mobile : "";
    if (mobile.trim() === "") {
      res.status(400).json({ error: "mobile query param is required" });
      return;
    }
    try {
      const status = (await store.getByMobile(mobile)) ?? {
        active: false,
        premium: false,
      };
      res.json(status);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}

export const channelRouter = createChannelRouter();
