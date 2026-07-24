import { Router } from "express";
import { getKbRuntime } from "../kb/runtime.js";
import { assertTenantWriteAccess, TenantAccessError, HUB } from "../kb/tenancy.js";
import { resolvePriceSignalFrom, type PriceObservationLike } from "../kb/priceStore.js";
import { searchKB } from "../kb/vectorKb.js";
import { resolveTableFrom, type TableKind } from "../kb/tableStore.js";
import { loadTable } from "../data/loader.js";
import { assertTenantAccess } from "../kb/tenancy.js";

export const kbRouter: Router = Router();

kbRouter.get("/prices/signal", async (req, res, next) => {
  try {
    const cropId = String(req.query.cropId ?? "");
    if (!cropId) { res.status(400).json({ error: "cropId is required" }); return; }
    const rows = await getKbRuntime().priceStore.listByCrop(cropId);
    const result = resolvePriceSignalFrom(rows, cropId);
    if (!result) { res.status(404).json({ error: "At least two real observations are required" }); return; }
    res.json({ ...result, disclaimer: "Historical trend only; not a price forecast." });
  } catch (err) { next(err); }
});

kbRouter.get("/search", async (req, res, next) => {
  try {
    const query = String(req.query.query ?? "").trim();
    if (!query) { res.status(400).json({ error: "query is required" }); return; }
    const { tenantStore } = getKbRuntime();
    const district = req.query.district ? String(req.query.district) : undefined;
    const tenantId = req.query.tenantId
      ? String(req.query.tenantId)
      : district ? await tenantStore.resolveTenantIdForDistrict(district) : HUB;
    const includeUnverified = req.query.includeUnverified === "true";
    if (req.query.tenantId || includeUnverified) {
      const userId = req.header("x-user-id");
      if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
      await assertTenantAccess(tenantStore, userId, tenantId);
    }
    const hits = await searchKB(query, { tenantId, cropId: req.query.cropId ? String(req.query.cropId) : undefined, includeUnverified });
    res.json({ tenantId, hits, citations: [...new Set(hits.map((h) => h.citation))] });
  } catch (err) {
    if (err instanceof TenantAccessError) { res.status(403).json({ error: err.message }); return; }
    next(err);
  }
});

const tableFiles: Record<TableKind, string> = {
  fertilizer: "fertilizer_frg.csv", calendar: "crop_calendar.csv", water: "crop_water.csv",
  variety: "varieties.csv", srdi: "srdi_fertility.csv",
};

kbRouter.get("/tables/:kind", async (req, res, next) => {
  try {
    const kind = req.params.kind as TableKind;
    if (!(kind in tableFiles)) { res.status(400).json({ error: "invalid table kind" }); return; }
    const cropId = String(req.query.cropId ?? "");
    if (!cropId && kind !== "srdi") { res.status(400).json({ error: "cropId is required" }); return; }
    const district = req.query.district ? String(req.query.district) : undefined;
    const { tenantStore, tableStore } = getKbRuntime();
    const tenantId = district ? await tenantStore.resolveTenantIdForDistrict(district) : HUB;
    const rows = await tableStore.list(kind, cropId);
    const resolved = resolveTableFrom(rows, { kind, cropId, district, tenantId }, () => {
      const candidates = loadTable(tableFiles[kind]);
      const selected = kind === "srdi"
        ? candidates.filter((r) => !district || r.district.toLowerCase() === district.toLowerCase())
        : candidates.filter((r) => r.cropId === cropId);
      return selected.length ? selected : undefined;
    });
    if (!resolved) { res.status(404).json({ error: "No table data available" }); return; }
    res.json(resolved);
  } catch (err) { next(err); }
});

/**
 * GET /api/kb/prices?cropId=&district=&farmLat=&farmLon=
 * Resolves the price the finance engine should use, tenant-over-hub, with provenance.
 */
kbRouter.get("/prices", async (req, res, next) => {
  try {
    const cropId = String(req.query.cropId ?? "");
    if (!cropId) {
      res.status(400).json({ error: "cropId is required" });
      return;
    }
    const district = req.query.district ? String(req.query.district) : undefined;
    const farmLat = req.query.farmLat ? Number(req.query.farmLat) : undefined;
    const farmLon = req.query.farmLon ? Number(req.query.farmLon) : undefined;

    const { priceStore, tenantStore } = getKbRuntime();
    const tenantId = district ? await tenantStore.resolveTenantIdForDistrict(district) : HUB;
    const resolved = await priceStore.resolve({ cropId, district, tenantId, farmLat, farmLon });

    if (!resolved) {
      // No non-mock price — never invent one (missing-info handling).
      res.status(404).json({ error: `No price available for ${cropId}`, cropId });
      return;
    }
    res.json(resolved);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/kb/tenants/:slug/prices   (header x-user-id, must be tenant_admin of :slug)
 * A district office posts a fresh local price; the resolver prefers it over the hub baseline.
 */
kbRouter.post("/tenants/:slug/prices", async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const userId = req.header("x-user-id");
    if (!userId) {
      res.status(401).json({ error: "x-user-id header required" });
      return;
    }

    const { tenantStore, priceStore } = getKbRuntime();
    const tenant = await tenantStore.getTenantBySlug(slug);
    if (!tenant) {
      res.status(404).json({ error: `Unknown tenant ${slug}` });
      return;
    }
    await assertTenantWriteAccess(tenantStore, userId, slug);

    const b = req.body as Partial<PriceObservationLike>;
    if (!b.cropId || b.price == null || !b.unit) {
      res.status(400).json({ error: "cropId, price and unit are required" });
      return;
    }
    const observation: PriceObservationLike = {
      tenantId: slug,
      cropId: b.cropId,
      district: b.district,
      market: b.market,
      latitude: b.latitude,
      longitude: b.longitude,
      price: Number(b.price),
      unit: b.unit,
      priceType: b.priceType ?? "retail",
      observedAt: b.observedAt ?? new Date().toISOString().slice(0, 10),
      source: `tenant:${slug}`,
      dataOrigin: "manual",
    };
    await priceStore.addObservations([observation]);
    res.status(201).json({ ok: true, observation });
  } catch (err) {
    if (err instanceof TenantAccessError) {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/kb/hub/prices/refresh   (header x-user-id, must be hub_admin)
 * Pulls the latest real WFP prices and upserts them as the hub baseline.
 */
kbRouter.post("/hub/prices/refresh", async (req, res, next) => {
  try {
    const userId = req.header("x-user-id");
    if (!userId) {
      res.status(401).json({ error: "x-user-id header required" });
      return;
    }
    const { tenantStore, priceStore, ingestHubPrices } = getKbRuntime();
    await assertTenantWriteAccess(tenantStore, userId, HUB);

    const sinceDate = req.body?.sinceDate as string | undefined;
    const prices = await ingestHubPrices({ sinceDate });
    await priceStore.addObservations(prices);

    const byCrop: Record<string, number> = {};
    for (const p of prices) byCrop[p.cropId] = (byCrop[p.cropId] ?? 0) + 1;
    res.json({ ok: true, imported: prices.length, byCrop, retrievedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof TenantAccessError) {
      res.status(403).json({ error: err.message });
      return;
    }
    next(err);
  }
});
