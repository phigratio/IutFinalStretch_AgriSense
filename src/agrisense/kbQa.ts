/**
 * KB-grounded question answering with a hard refusal guardrail (main pipeline).
 * A farmer's factual question ("when do we harvest boro rice?") is answered ONLY
 * from retrieved KB evidence, and REFUSED when the KB has no relevant source —
 * instead of emitting the crop-plan stage template or hallucinating.
 *
 * Two guardrail layers: (1) a relevance-score gate over the REAL KB (searchKB /
 * mem0, verified-only — never the seeded fallback, which would always "match");
 * (2) the LLM is constrained to the retrieved chunks and must emit a refusal
 * token if they don't contain the answer. No key / API error → degrade to the
 * top verified snippet (still grounded). Consumed by agrisenseService.handleMessage.
 */
import { config } from "../config.js";
import { searchKB, type KbHit } from "../kb/vectorKb.js";
import type { SupportedLanguage } from "../language/localization.js";
import type { RetrievedEvidence } from "./types.js";

/** mem0 similarity floor (searchKB adds a tenant boost on top). */
const MIN_SCORE = 0.3;
const REFUSAL_TOKEN = "<<NO_ANSWER>>";

const REFUSAL: Record<"bn" | "en", string> = {
  bn: "এই প্রশ্নের উত্তর এখনো আমার জ্ঞানভাণ্ডারে (knowledge base) নেই, তাই আমি অনুমান করে উত্তর দেব না। জ্ঞানভাণ্ডারে থাকা কোনো ফসল, সার, রোগ-পোকা বা মৌসুম সম্পর্কে জিজ্ঞেস করুন।",
  en: "I don't have that in my knowledge base yet, so I won't guess. Try asking about a crop, fertilizer, pest, or season the knowledge base covers.",
};

export function refusalMessage(language?: string): string {
  return language === "bn" ? REFUSAL.bn : REFUSAL.en;
}

// Planning-intent questions ("which crop should I plant?") belong to the crop
// workflow, and scenario questions ("what if rainfall drops?") to the scenario
// engine — neither should be intercepted by KB Q&A.
const PLANNING_INTENT = /(which|what|best|recommend|suggest)\b.{0,40}\b(crop|plant|grow|cultivat)|crop\s+(recommendation|ranking)|what\s+(should|can|to)\s+(i\s+)?(plant|grow)|কোন\s*ফসল|কী\s*চাষ|চাষ\s*কর|রোপণ|সুপারিশ/i;
const SCENARIO_INTENT = /(what\s*if|scenario|re-?plan|recalculat|rainfall\s+(drop|fall)|budget\s+(cut|drop)|যদি|কমে\s*গেলে)/i;
// "what should I do next?", "what's next?", "next step" — requests for the plan
// itself, handled by the planning workflow, not KB Q&A.
const ACTION_INTENT = /(what\s+(should|do|to|can)\s+(i\s+)?do|what('?s|s|\s+is)?\s+next|what\s+now|next\s+step|এখন\s*কী|কী\s*কর|পরবর্তী)/i;
const QUESTION_CUE = /[?？]|^\s*(when|what|how|why|which|where|who|whose|should|can|could|would|will|is|are|does|do|did|has|have)\b|কখন|কবে|কীভাবে|কিভাবে|কেন|কোথায়|কত\b|কি\b|কী\b|\b(kobe|kokhon|kivabe|keno|kothay|koto)\b/i;

/** True when the message is an informational question we should answer from the KB. */
export function isKbQuestion(message: string): boolean {
  const m = message.trim();
  if (!m) return false;
  if (PLANNING_INTENT.test(m) || SCENARIO_INTENT.test(m) || ACTION_INTENT.test(m)) return false;
  return QUESTION_CUE.test(m);
}

export interface KbAnswer {
  /** true = grounded answer produced; false = refusal (not in KB). */
  answered: boolean;
  message: string;
  evidence: RetrievedEvidence[];
  hits: KbHit[];
}

export async function answerFromKb(input: {
  question: string;
  tenantId?: string;
  language?: SupportedLanguage;
}): Promise<KbAnswer> {
  const hits = (await searchKB(input.question, { tenantId: input.tenantId, limit: 5 }))
    .filter((h) => h.score >= MIN_SCORE);
  const evidence = hits.map(hitToEvidence);

  if (hits.length === 0) {
    return { answered: false, message: refusalMessage(input.language), evidence, hits };
  }

  const answer = await generateGroundedAnswer(input.question, hits, input.language);
  if (!answer) {
    return { answered: false, message: refusalMessage(input.language), evidence, hits };
  }

  const citations = [...new Set(hits.map((h) => h.citation).filter(Boolean))].join("  ");
  return { answered: true, message: citations ? `${answer}\n\n📚 ${citations}` : answer, evidence, hits };
}

function hitToEvidence(h: KbHit, i: number): RetrievedEvidence {
  return {
    id: h.docKey ? `kb:${h.docKey}` : `kb:${i}`,
    source: "rag",
    title: h.title ?? h.source ?? "Knowledge base",
    content: h.text,
    citation: h.citation,
    crop: typeof h.docKey === "string" ? h.docKey.split(":")[0] : undefined,
    metadata: { score: h.score, scope: h.scope, page: h.page },
  };
}

/**
 * Ask OpenAI to answer STRICTLY from the retrieved chunks. Returns the answer,
 * or null when the model signals the sources don't cover it (→ caller refuses).
 * No key or API error degrades to the top verified snippet (still grounded).
 */
async function generateGroundedAnswer(
  question: string,
  hits: KbHit[],
  language?: SupportedLanguage,
): Promise<string | null> {
  if (!config.openaiApiKey) return hits[0]?.text ?? null;

  const lang = language === "bn" ? "Bengali" : "English";
  const sources = hits.map((h, i) => `[${i + 1}] ${h.text}`).join("\n");
  const system = `You are AgriSense's knowledge assistant for Bangladeshi smallholder farmers.
Answer the farmer's question USING ONLY the numbered SOURCES below. Do NOT use any outside knowledge.
If the sources do not clearly contain the answer, reply with exactly ${REFUSAL_TOKEN} and nothing else.
Keep it to 1-3 short sentences. Never invent numbers, dates, or crop names. Answer in ${lang}.
SOURCES:
${sources}`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${config.openaiApiKey}` },
      body: JSON.stringify({
        model: config.openaiChatModel,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
        temperature: 0,
      }),
    });
    if (!res.ok) return hits[0]?.text ?? null;
    const body = JSON.parse(await res.text()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!content || content.includes(REFUSAL_TOKEN)) return null;
    return content;
  } catch {
    return hits[0]?.text ?? null;
  }
}
