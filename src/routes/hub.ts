import { Router } from "express";
import { getKbRuntime } from "../kb/runtime.js";
import { assertTenantWriteAccess, HUB, TenantAccessError } from "../kb/tenancy.js";
import { addChunk, type KbChunkMeta } from "../kb/vectorKb.js";
import type { TableKind } from "../kb/tableStore.js";
import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { authenticate, type AuthenticatedRequest } from "../middleware/authenticate.js";
import { ingestionDb } from "../kb/ingestionJobs.js";
import { getKbDocumentStore } from "../kb/documentStore.js";

export const hubRouter = Router();
const uploadDir = process.env.KB_UPLOAD_DIR ?? path.resolve("uploads/kb");
mkdirSync(uploadDir, { recursive: true });
const centralUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 25 },
  fileFilter: (_req, file, cb) => cb(null, new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".docx", ".epub", ".txt", ".md", ".csv"]).has(path.extname(file.originalname).toLowerCase())),
});

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

/** Central admin bulk upload. Each file becomes an independent persistent background job. */
hubRouter.post("/kb/uploads", authenticate, centralUpload.array("files", 25), async (req, res, next) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) { res.status(400).json({ error: "Select at least one supported file" }); return; }
    const requestedBy = (req as typeof req & AuthenticatedRequest).auth!.sub;
    const verificationStatus = String(req.body.verificationStatus || "unverified");
    if (!["unverified", "cross_checked", "verified"].includes(verificationStatus)) {
      res.status(400).json({ error: "Invalid verificationStatus" }); return;
    }
    const jobs = [];
    for (const file of files) {
      jobs.push(await ingestionDb().kbIngestionJob.create({ data: {
        tenantId: HUB, requestedBy, originalName: file.originalname, storedPath: file.path,
        mimeType: file.mimetype || "application/octet-stream", sizeBytes: file.size,
        title: String(req.body.title || path.parse(file.originalname).name).trim(),
        source: String(req.body.source || "Admin upload").trim(), sourceUrl: req.body.sourceUrl || null,
        cropId: req.body.cropId || null, docType: req.body.docType || "reference", verificationStatus,
      } }));
    }
    res.status(202).json({ jobs });
  } catch (err) { next(err); }
});

hubRouter.get("/kb/jobs", authenticate, async (_req, res, next) => {
  try {
    const rows = await ingestionDb().kbIngestionJob.findMany({ where: { tenantId: HUB }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(rows.map(({ storedPath: _storedPath, ...job }) => job));
  } catch (err) { next(err); }
});

hubRouter.post("/kb/jobs/:jobId/retry", authenticate, async (req, res, next) => {
  try {
    const result = await ingestionDb().kbIngestionJob.updateMany({
      where: { id: String(req.params.jobId), tenantId: HUB, status: "failed" },
      data: { status: "queued", stage: "queued", extractedChars: 0, chunkCount: 0, processedChunks: 0,
        errorMessage: null, startedAt: null, finishedAt: null },
    });
    if (!result.count) { res.status(409).json({ error: "Only a failed central-hub job can be retried" }); return; }
    res.status(202).json({ ok: true });
  } catch (err) { next(err); }
});

hubRouter.get("/kb/docs", authenticate, async (_req, res, next) => {
  try { res.json(await getKbDocumentStore().list(HUB)); } catch (err) { next(err); }
});
