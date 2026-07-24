/**
 * CLI: chunk a source document and push it into the mem0 KB (hub or a tenant namespace).
 *
 *   npx tsx scripts/kb-ingest.ts \
 *     --file kb-sources/frg2018-boro.md \
 *     --scope hub --docKey frg2018:boro --docType fertilizer --crop rice_boro \
 *     --source "FRG-2018" --url https://barc.gov.bd --page 42
 *
 * For a tenant override, add: --scope tenant --tenant dist-kushtia
 * All chunks of a doc share --docKey so a tenant doc can override the hub doc of the same key.
 * Requires mem0-api reachable (uses OPENAI_API_KEY for embeddings under the hood).
 */

import { readFileSync } from "node:fs";
import { chunkText } from "../src/kb/ingest/chunkDoc.js";
import { addChunk, type KbChunkMeta } from "../src/kb/vectorKb.js";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const file = arg("file");
  const docKey = arg("docKey");
  const source = arg("source");
  if (!file || !docKey || !source) {
    console.error("Required: --file <path> --docKey <key> --source <name>");
    process.exit(2);
  }

  const scope = (arg("scope", "hub") as "hub" | "tenant") ?? "hub";
  const tenantId = arg("tenant");
  if (scope === "tenant" && !tenantId) {
    console.error("--scope tenant requires --tenant <slug>");
    process.exit(2);
  }

  const text = readFileSync(file, "utf8");
  const chunks = chunkText(text, {
    targetTokens: Number(arg("target", "500")),
    overlapTokens: Number(arg("overlap", "50")),
  });
  console.log(`Chunked ${file} into ${chunks.length} chunks; pushing to mem0 (${scope}${tenantId ? `:${tenantId}` : ""})…`);

  const baseMeta: Omit<KbChunkMeta, "docKey"> = {
    scope,
    tenantId,
    docType: arg("docType", "practice")!,
    cropId: arg("crop"),
    season: arg("season"),
    source,
    sourceUrl: arg("url"),
    page: arg("page"),
    dataOrigin: arg("dataOrigin", scope === "hub" ? "manual" : "manual")!,
  };

  let ok = 0;
  for (const chunk of chunks) {
    try {
      await addChunk(chunk.text, { ...baseMeta, docKey });
      ok++;
    } catch (err) {
      console.error(`  chunk ${chunk.ordinal} failed:`, (err as Error).message);
    }
  }
  console.log(`Ingested ${ok}/${chunks.length} chunks under docKey "${docKey}".`);
}

main().catch((err) => {
  console.error("kb-ingest failed:", err);
  process.exit(1);
});
