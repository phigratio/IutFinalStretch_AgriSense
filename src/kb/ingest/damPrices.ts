import type { PriceObservationLike } from "../priceStore.js";

const cropAliases: Record<string, string> = {
  rice: "rice_t_aman", paddy: "rice_t_aman", dhan: "rice_t_aman",
  potato: "potato", alu: "potato", maize: "maize", corn: "maize",
  wheat: "wheat", mustard: "mustard", lentil: "lentil", onion: "onion",
};

export interface DamParseOptions { observedAt: string; district?: string; sourceUrl?: string }

/**
 * Parse text extracted from the declared-manual DAM PDF. Expected rows contain a commodity name
 * followed by low/high BDT-per-kg prices; the midpoint is stored and the raw range is retained in
 * commodityLabel. Ambiguous rows are skipped rather than guessed.
 */
export function parseDamPriceText(text: string, opts: DamParseOptions): PriceObservationLike[] {
  const rows: PriceObservationLike[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\s+/g, " ");
    const alias = Object.keys(cropAliases).find((name) => new RegExp(`\\b${name}\\b`, "i").test(line));
    if (!alias) continue;
    const numbers = [...line.matchAll(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/g)].map((m) => Number(m[1]));
    if (numbers.length < 2) continue;
    const [low, high] = numbers.slice(-2);
    if (!(low > 0 && high >= low && high < 10000)) continue;
    rows.push({
      tenantId: "hub", cropId: cropAliases[alias], commodityLabel: `${line} [range ${low}-${high}]`,
      district: opts.district, price: (low + high) / 2, unit: "kg", priceType: "retail",
      observedAt: opts.observedAt, source: "DAM daily PDF", sourceUrl: opts.sourceUrl,
      dataOrigin: "manual", verification: "unverified",
    });
  }
  return rows;
}
