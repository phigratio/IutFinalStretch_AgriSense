import { Router } from "express";
import { getKbRuntime } from "../kb/runtime.js";
import { assertTenantAccess, assertTenantWriteAccess, HUB, TenantAccessError } from "../kb/tenancy.js";
import { addChunk, type KbChunkMeta } from "../kb/vectorKb.js";
import { getKbDocumentStore } from "../kb/documentStore.js";
import type { TableKind } from "../kb/tableStore.js";
import type { PriceObservationLike } from "../kb/priceStore.js";
import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { ingestionDb } from "../kb/ingestionJobs.js";
import { chunkText } from "../kb/ingest/chunkDoc.js";

export const tenantsRouter = Router();
const user = (req: { header(name: string): string | undefined }) => req.header("x-user-id");
const uploadDir = process.env.KB_UPLOAD_DIR ?? path.resolve("uploads/kb");
mkdirSync(uploadDir, { recursive: true });
const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".docx", ".epub", ".txt", ".md", ".csv"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, allowedExtensions.has(path.extname(file.originalname).toLowerCase())),
});

const privateIpv4 = (address: string) => {
  const octets = address.split(".").map(Number);
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
};

const privateIp = (address: string) => {
  if (isIP(address) === 4) return privateIpv4(address);
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
};

async function assertPublicUrl(url: URL): Promise<void> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error("Only public http/https links are allowed");
  if (url.hostname === "localhost" || url.hostname.endsWith(".local")) throw new Error("Local links are not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error("Private network links are not allowed");
}

function readableText(content: string, contentType: string): { title?: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(content)?.[1]
    ?.replace(/\s+/g, " ").trim();
  const withoutNoise = contentType.includes("html")
    ? content.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
    : content;
  const text = withoutNoise
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'").replace(/&quot;/gi, '"').replace(/\s+/g, " ").trim();
  return { title, text };
}

export async function fetchKnowledgeLink(rawUrl: string): Promise<{ url: string; title?: string; text: string }> {
  let current = new URL(rawUrl);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await assertPublicUrl(current);
    const response = await fetch(current, { redirect: "manual", signal: AbortSignal.timeout(12_000), headers: { "user-agent": "AgriSense-KB/1.0" } });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      current = new URL(response.headers.get("location")!, current);
      continue;
    }
    if (!response.ok) throw new Error(`The link returned HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) throw new Error("The link must open a readable web page");
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 2_000_000) throw new Error("The linked page is too large");
    const body = await response.text();
    if (body.length > 2_000_000) throw new Error("The linked page is too large");
    const parsed = readableText(body, contentType);
    if (parsed.text.length < 80) throw new Error("No useful readable text was found at this link");
    return { url: current.toString(), ...parsed };
  }
  throw new Error("The link redirects too many times");
}

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

tenantsRouter.post("/:tid/kb/uploads", async (req, res, next) => {
  try {
    const userId = user(req);
    if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    await assertTenantWriteAccess(getKbRuntime().tenantStore, userId, String(req.params.tid));
    next();
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
}, upload.single("file"), async (req, res, next) => {
  try {
    const userId = user(req)!;
    const tenantId = String(req.params.tid);
    if (!req.file) { res.status(400).json({ error: "A supported file is required (PDF, image, DOCX, EPUB, TXT, MD, or CSV)" }); return; }
    const title = String(req.body.title || path.parse(req.file.originalname).name).trim();
    const source = String(req.body.source || "Admin upload").trim();
    const verificationStatus = String(req.body.verificationStatus || "unverified");
    if (!["unverified", "cross_checked", "verified"].includes(verificationStatus)) {
      res.status(400).json({ error: "Invalid verificationStatus" }); return;
    }
    const job = await ingestionDb().kbIngestionJob.create({ data: {
      tenantId, requestedBy: userId, originalName: req.file.originalname,
      storedPath: req.file.path, mimeType: req.file.mimetype || "application/octet-stream", sizeBytes: req.file.size,
      title, source, sourceUrl: req.body.sourceUrl || null, cropId: req.body.cropId || null,
      docType: req.body.docType || "reference", verificationStatus,
    } });
    res.status(202).json(job);
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.post("/:tid/kb/links", async (req, res, next) => {
  try {
    const userId = user(req);
    if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    await assertTenantWriteAccess(getKbRuntime().tenantStore, userId, req.params.tid);
    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!rawUrl) { res.status(400).json({ error: "A web link is required" }); return; }
    let page: Awaited<ReturnType<typeof fetchKnowledgeLink>>;
    try {
      page = await fetchKnowledgeLink(rawUrl);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "The link could not be read" });
      return;
    }
    const title = typeof req.body?.title === "string" && req.body.title.trim() ? req.body.title.trim() : page.title || new URL(page.url).hostname;
    const docKey = `link:${randomUUID()}`;
    const chunks = chunkText(page.text);
    for (const chunk of chunks) {
      await addChunk(chunk.text, {
        scope: "tenant", tenantId: req.params.tid, docKey, title, docType: "web_link",
        source: page.url, sourceUrl: page.url, page: `section ${chunk.ordinal + 1}`,
        dataOrigin: "linked", verificationStatus: "unverified", retrievedAt: new Date().toISOString(),
      });
    }
    res.status(201).json({ ok: true, docKey, title, chunks: chunks.length });
  } catch (err) {
    if (err instanceof TenantAccessError) { res.status(403).json({ error: err.message }); return; }
    next(err);
  }
});

tenantsRouter.get("/:tid/kb/jobs", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantAccess(tenantStore, userId, req.params.tid);
    const jobs = await ingestionDb().kbIngestionJob.findMany({ where: { tenantId: req.params.tid }, orderBy: { createdAt: "desc" }, take: 50 });
    res.json(jobs.map(({ storedPath: _storedPath, ...job }) => job));
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});

tenantsRouter.get("/:tid/kb/jobs/:jobId", async (req, res, next) => {
  try {
    const userId = user(req); if (!userId) { res.status(401).json({ error: "x-user-id header required" }); return; }
    const { tenantStore } = getKbRuntime(); await assertTenantAccess(tenantStore, userId, req.params.tid);
    const row = await ingestionDb().kbIngestionJob.findFirst({ where: { id: req.params.jobId, tenantId: req.params.tid } });
    if (!row) { res.status(404).json({ error: "ingestion job not found" }); return; }
    const { storedPath: _storedPath, ...job } = row; res.json(job);
  } catch (err) { if (err instanceof TenantAccessError) res.status(403).json({ error: err.message }); else next(err); }
});
