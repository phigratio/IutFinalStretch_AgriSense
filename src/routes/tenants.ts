import { Router } from "express";
import { getKbRuntime } from "../kb/runtime.js";
import { assertTenantAccess, assertTenantWriteAccess, HUB, TenantAccessError } from "../kb/tenancy.js";
import { addChunk, type KbChunkMeta } from "../kb/vectorKb.js";
import { getKbDocumentStore } from "../kb/documentStore.js";
import type { TableKind } from "../kb/tableStore.js";
import type { PriceObservationLike } from "../kb/priceStore.js";

export const tenantsRouter = Router();
const user = (req: { header(name: string): string | undefined }) => req.header("x-user-id");

tenantsRouter.post("/", async (req, res, next) => {
  try {
    const userId = user(req);
    if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime();
    await assertTenantAccess(tenantStore, userId, HUB, "hub_admin");
    const { slug, name, kind = "district", districts = [] } = req.body ?? {};
    if (!slug || !name) { res.status(400).json({ error: "slug and name are required" }); return; }
    const tenant = await tenantStore.createTenant({ slug, name, kind });
    for (const district of districts as string[]) await tenantStore.addJurisdiction(slug, district);
    res.status(201).json(tenant);
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.get("/:tid", async (req, res, next) => {
  try {
    const userId = user(req);
    if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime();
    await assertTenantAccess(tenantStore, userId, req.params.tid);
    const tenant = await tenantStore.getTenantBySlug(req.params.tid);
    if (!tenant) { res.status(404).json({ error: "tenant not found" }); return; }
    res.json(tenant);
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.patch("/:tid", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantAccess(tenantStore, userId, HUB, "hub_admin");
    const changes = Object.fromEntries(Object.entries({ name: req.body?.name, kind: req.body?.kind }).filter(([, value]) => value !== undefined));
    const tenant = await tenantStore.updateTenant(req.params.tid, changes);
    if (!tenant) { res.status(404).json({ error: "tenant not found" }); return; }
    res.json(tenant);
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.delete("/:tid", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantAccess(tenantStore, userId, HUB, "hub_admin");
    if (!await tenantStore.deleteTenant(req.params.tid)) { res.status(404).json({ error: "tenant not found" }); return; }
    res.status(204).end();
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.post("/:tid/prices", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore, priceStore } = getKbRuntime();
    await assertTenantWriteAccess(tenantStore, userId, req.params.tid);
    const b = req.body ?? {};
    if (!b.cropId || b.price == null || !b.unit) { res.status(400).json({ error: "cropId, price and unit are required" }); return; }
    if (b.district && await tenantStore.resolveTenantIdForDistrict(b.district) !== req.params.tid) {
      res.status(403).json({ error: `District ${b.district} is outside tenant jurisdiction` }); return;
    }
    const observation: PriceObservationLike = { tenantId: req.params.tid, cropId: b.cropId, district: b.district,
      market: b.market, latitude: b.latitude, longitude: b.longitude, price: Number(b.price), unit: b.unit,
      priceType: b.priceType ?? "retail", observedAt: b.observedAt ?? new Date().toISOString().slice(0, 10),
      source: `tenant:${req.params.tid}`, dataOrigin: "manual", verification: "unverified" };
    await priceStore.addObservations([observation]); res.status(201).json({ ok: true, observation });
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.put("/:tid/tables/:kind", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore, tableStore } = getKbRuntime(); await assertTenantWriteAccess(tenantStore, userId, req.params.tid);
    const { cropId, district, payload, source = `tenant:${req.params.tid}` } = req.body ?? {};
    if (!cropId || payload == null) { res.status(400).json({ error: "cropId and payload are required" }); return; }
    if (district && await tenantStore.resolveTenantIdForDistrict(district) !== req.params.tid) {
      res.status(403).json({ error: `District ${district} is outside tenant jurisdiction` }); return;
    }
    await tableStore.addOverride({ tenantId: req.params.tid, kind: req.params.kind as TableKind, cropId, district, payload, source, dataOrigin: "manual" });
    res.status(201).json({ ok: true });
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.get("/:tid/kb/docs", async (req, res, next) => {
  try { const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantAccess(tenantStore, userId, req.params.tid);
    res.json(await getKbDocumentStore().list(req.params.tid));
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.post("/:tid/kb/docs", async (req, res, next) => {
  try { const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantWriteAccess(tenantStore, userId, req.params.tid);
    const { text, docKey, docType = "advisory", cropId, source, sourceUrl, page } = req.body ?? {};
    if (!text || !docKey || !source) { res.status(400).json({ error: "text, docKey and source are required" }); return; }
    const meta: KbChunkMeta = { scope: "tenant", tenantId: req.params.tid, docKey, docType, cropId, source, sourceUrl, page, dataOrigin: "manual", verificationStatus: "unverified", retrievedAt: new Date().toISOString() };
    await addChunk(text, meta); res.status(201).json({ ok: true, docKey });
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});
