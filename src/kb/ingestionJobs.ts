import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";
import { extractFile } from "./ingest/extractFile.js";
import { chunkText } from "./ingest/chunkDoc.js";
import { addChunk, type KbChunkMeta } from "./vectorKb.js";
import { HUB } from "./tenancy.js";

const prisma = config.databaseUrl
  ? new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) })
  : null;
let timer: NodeJS.Timeout | undefined;
let working = false;

export function ingestionDb(): PrismaClient {
  if (!prisma) throw new Error("File ingestion jobs require DATABASE_URL");
  return prisma;
}

async function claimNextJob() {
  const db = ingestionDb();
  const candidate = await db.kbIngestionJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await db.kbIngestionJob.updateMany({
    where: { id: candidate.id, status: "queued" },
    data: { status: "processing", stage: "extracting", startedAt: new Date(), errorMessage: null },
  });
  return claimed.count === 1 ? candidate : null;
}

async function processOne(): Promise<void> {
  if (working || !prisma) return;
  working = true;
  try {
    const job = await claimNextJob();
    if (!job) return;
    try {
      const sections = await extractFile(job.storedPath, job.mimeType, job.originalName);
      const extractedChars = sections.reduce((sum, section) => sum + section.text.length, 0);
      const chunks = sections.flatMap((section) => chunkText(section.text).map((chunk) => ({ ...chunk, page: section.label })));
      if (!chunks.length) throw new Error("Extraction completed, but no usable text chunks were produced");
      await prisma.kbIngestionJob.update({ where: { id: job.id }, data: { stage: "embedding", extractedChars, chunkCount: chunks.length } });
      const scope = job.tenantId === HUB ? "hub" : "tenant";
      for (let index = job.processedChunks; index < chunks.length; index++) {
        const chunk = chunks[index];
        const meta: KbChunkMeta = {
          scope, tenantId: scope === "tenant" ? job.tenantId : undefined,
          docKey: `upload:${job.id}`, title: job.title, docType: job.docType, cropId: job.cropId ?? undefined,
          source: job.source, sourceUrl: job.sourceUrl ?? undefined, page: chunk.page,
          dataOrigin: "uploaded", verificationStatus: job.verificationStatus as KbChunkMeta["verificationStatus"],
          retrievedAt: job.createdAt.toISOString(),
        };
        await addChunk(chunk.text, meta);
        await prisma.kbIngestionJob.update({ where: { id: job.id }, data: { processedChunks: index + 1 } });
      }
      await prisma.kbIngestionJob.update({ where: { id: job.id }, data: { status: "completed", stage: "completed", finishedAt: new Date() } });
    } catch (error) {
      await prisma.kbIngestionJob.update({ where: { id: job.id }, data: {
        status: "failed", stage: "failed", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message.slice(0, 2000) : String(error),
      } });
    }
  } finally {
    working = false;
  }
}

export async function startKbIngestionWorker(): Promise<void> {
  if (!prisma || timer) return;
  await prisma.kbIngestionJob.updateMany({ where: { status: "processing" }, data: { status: "queued", stage: "queued", startedAt: null } });
  timer = setInterval(() => void processOne(), 1500);
  timer.unref();
  void processOne();
}

export async function stopKbIngestionWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  await prisma?.$disconnect();
}
