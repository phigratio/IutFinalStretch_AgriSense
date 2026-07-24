/**
 * Guardrail smoke test for the KB Q&A path. Confirms routing (isKbQuestion) and
 * that answerFromKb refuses when the KB lacks the answer but answers (grounded)
 * when it has it. Run: npx tsx --env-file=.env scripts/check-kb-qa.ts
 */
import { isKbQuestion, answerFromKb } from "../src/agrisense/kbQa.js";

async function ask(q: string): Promise<void> {
  const routed = isKbQuestion(q);
  console.log(`\nQ: "${q}"`);
  console.log(`   routed to KB Q&A: ${routed}`);
  if (!routed) { console.log("   → goes to plan/scenario workflow (not Q&A)."); return; }
  const a = await answerFromKb({ question: q, language: "en" });
  console.log(`   answered from KB: ${a.answered} (hits: ${a.hits.length}, top score: ${(a.hits[0]?.score ?? 0).toFixed(3)})`);
  console.log(`   reply: ${a.message.replace(/\n+/g, " ")}`);
}

async function main(): Promise<void> {
  // Should REFUSE — no boro-rice calendar in the KB.
  await ask("when do we harvest boro rice?");
  // Should ANSWER — the demo brinjal chunk was ingested by check-rag.ts.
  await ask("which brinjal variety resists fruit borer?");
  // Should NOT route to Q&A — this is a planning request.
  await ask("which crop should I plant this season?");
}

main().catch((e) => { console.error(e); process.exit(1); });
