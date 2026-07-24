/**
 * RAG smoke test: ingest a distinctive demo chunk into the mem0-backed KB
 * (vectorKb) and confirm searchKB retrieves it. Also reports whether the main
 * pipeline's mem0 retrieval is enabled. Run: npx tsx --env-file=.env scripts/check-rag.ts
 */
import { addChunk, searchKB, type KbChunkMeta } from "../src/kb/vectorKb.js";
import { config } from "../src/config.js";

const DOC_KEY = "demo:zangbari-brinjal";
const FACT =
  "Zangbari purple brinjal (variety AGRI-DEMO-7) yields 42 tonnes per hectare on loam soil and resists fruit-and-shoot borer when neem oil is sprayed at flowering.";

async function main(): Promise<void> {
  console.log("mem0 API URL:", config.mem0ApiUrl);
  console.log("MEM0_PERSISTENCE_ENABLED (main pipeline):", config.mem0PersistenceEnabled);
  console.log("KB hub userId:", config.mem0KbUserId, "\n");

  const meta: KbChunkMeta = {
    scope: "hub",
    docKey: DOC_KEY,
    title: "Zangbari Brinjal Demo",
    docType: "variety",
    cropId: "brinjal",
    source: "AgriSense RAG Demo",
    dataOrigin: "manual",
    verificationStatus: "verified",
    retrievedAt: new Date().toISOString(),
  };

  console.log("→ Ingesting demo chunk…");
  try {
    await addChunk(FACT, meta);
    console.log("  ✅ addChunk succeeded (mem0 write + kb_documents metadata).\n");
  } catch (err) {
    console.error("  ❌ addChunk FAILED:", (err as Error).message);
    process.exit(1);
  }

  // mem0 indexes asynchronously; give it a moment.
  await new Promise((r) => setTimeout(r, 1500));

  const query = "Which brinjal variety resists fruit borer and its yield on loam?";
  console.log(`→ Searching: "${query}"`);
  const hits = await searchKB(query, { includeUnverified: true, limit: 5 });

  console.log(`  Retrieved ${hits.length} hit(s):`);
  for (const h of hits) {
    console.log(`   - [${h.score.toFixed(3)}] ${h.citation} ${h.docKey ?? ""}`);
    console.log(`     ${h.text.slice(0, 90)}…`);
  }

  const found = hits.some((h) => h.docKey === DOC_KEY || h.text.includes("Zangbari"));
  console.log(`\n${found ? "✅ RAG RETRIEVAL WORKS — demo chunk was found." : "❌ RAG FAILED — demo chunk not retrieved."}`);
  process.exit(found ? 0 : 2);
}

main().catch((err) => {
  console.error("check-rag crashed:", err);
  process.exit(1);
});
