import { Router } from "express";
import { getKbRuntime } from "../kb/runtime.js";
import { assertTenantWriteAccess, HUB, TenantAccessError } from "../kb/tenancy.js";
import { addChunk, type KbChunkMeta } from "../kb/vectorKb.js";
import type { TableKind } from "../kb/tableStore.js";

export const hubRouter = Router();

async function requireHub(req: { header(name: string): string | undefined }): Promise<void> {
  const userId = req.header("x-user-id");
  if (!userId) throw new TenantAccessError("x-user-id header required");
  await assertTenantWriteAccess(getKbRuntime().tenantStore, userId, HUB);
}

hubRouter.post("/prices/refresh", async (req, res, next) => {
  try {
    await requireHub(req);
    const { priceStore, ingestHubPrices } = getKbRuntime();
    const prices = await ingestHubPrices({ sinceDate: req.body?.sinceDate });
    await priceStore.addObservations(prices);
    const dates = prices.map((p) => p.observedAt).sort();
    res.json({ ok: true, imported: prices.length, dateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : null, retrievedAt: new Date().toISOString() });
  } catch (err) { if (err instanceof TenantAccessError) res.status(req.header("x-user-id") ? 403 : 401).json({ error: err.message }); else next(err); }
});

hubRouter.post("/kb/ingest", async (req, res, next) => {
  try {
    await requireHub(req);
    const { text, docKey, docType = "practice", cropId, source, sourceUrl, page, dataOrigin = "manual", verificationStatus = "unverified" } = req.body ?? {};
    if (!text || !docKey || !source) { res.status(400).json({ error: "text, docKey and source are required" }); return; }
    const meta: KbChunkMeta = { scope: "hub", docKey, docType, cropId, source, sourceUrl, page, dataOrigin, verificationStatus, retrievedAt: new Date().toISOString() };
    await addChunk(text, meta); res.status(201).json({ ok: true, docKey });
  } catch (err) { if (err instanceof TenantAccessError) res.status(req.header("x-user-id") ? 403 : 401).json({ error: err.message }); else next(err); }
});

hubRouter.post("/tables/import", async (req, res, next) => {
  try {
    await requireHub(req);
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) { res.status(400).json({ error: "rows is required" }); return; }
    const { tableStore } = getKbRuntime();
    for (const row of rows) {
      await tableStore.addOverride({ tenantId: HUB, kind: row.kind as TableKind, cropId: row.cropId,
        district: row.district, payload: row.payload, source: row.source, dataOrigin: row.dataOrigin ?? "manual" });
    }
    res.status(201).json({ ok: true, imported: rows.length });
  } catch (err) { if (err instanceof TenantAccessError) res.status(req.header("x-user-id") ? 403 : 401).json({ error: err.message }); else next(err); }
});
