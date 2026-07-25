/**
 * Prose chunker for KB ingestion (K3-3). Splits a source document into ~500-token,
 * sentence-boundary-respecting chunks with small overlap, so retrieval returns coherent,
 * citable passages. Pure and deterministic.
 */

export interface ChunkOptions {
  /** Target chunk size in tokens (~4 chars/token). Default 500. */
  targetTokens?: number;
  /** Overlap between consecutive chunks, in tokens. Default 50. */
  overlapTokens?: number;
}

export interface DocChunk {
  ordinal: number;
  text: string;
  approxTokens: number;
}

/** Rough token estimate (~0.75 words/token, matching typical English tokenizers). */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 0.75);
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?।])\s+/) // includes Bangla danda ।
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Chunk `text` into ~targetTokens passages on sentence boundaries with `overlapTokens` of
 * carry-over. A single over-long sentence becomes its own chunk rather than being cut mid-word.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): DocChunk[] {
  const targetTokens = opts.targetTokens ?? 500;
  const overlapTokens = opts.overlapTokens ?? 50;
  // Strip HTML comment blocks (e.g. the leading `<!-- docKey: ... -->` metadata
  // header) so retrieval snippets show clean prose, not source-file bookkeeping.
  const cleaned = text.replace(/<!--[\s\S]*?-->/g, " ");
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) return [];

  const chunks: DocChunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    const body = current.join(" ");
    chunks.push({ ordinal: chunks.length, text: body, approxTokens: estimateTokens(body) });
    // Seed the next chunk with a sentence-level overlap tail.
    const tail: string[] = [];
    let tailTokens = 0;
    for (let i = current.length - 1; i >= 0 && tailTokens < overlapTokens; i--) {
      tail.unshift(current[i]);
      tailTokens += estimateTokens(current[i]);
    }
    current = overlapTokens > 0 ? tail : [];
    currentTokens = tailTokens;
  };

  for (const sentence of sentences) {
    const t = estimateTokens(sentence);
    if (currentTokens > 0 && currentTokens + t > targetTokens) {
      flush();
    }
    current.push(sentence);
    currentTokens += t;
  }
  // Final flush without seeding overlap.
  if (current.length) {
    const body = current.join(" ");
    chunks.push({ ordinal: chunks.length, text: body, approxTokens: estimateTokens(body) });
  }

  return chunks;
}
