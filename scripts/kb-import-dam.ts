/** Extract a DAM daily PDF with pdftotext and import its declared-manual price ranges. */
import { execFile } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDamPriceText } from "../src/kb/ingest/damPrices.js";
import { getKbRuntime } from "../src/kb/runtime.js";

const run = promisify(execFile);
const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1]; };

async function main() {
  const file = arg("file"); const date = arg("date");
  if (!file || !date) throw new Error("Required: --file report.pdf --date YYYY-MM-DD [--district District]");
  const output = join(tmpdir(), `agrisense-dam-${process.pid}.txt`);
  try {
    await run("pdftotext", ["-layout", file, output]);
    const prices = parseDamPriceText(await readFile(output, "utf8"), {
      observedAt: date, district: arg("district"), sourceUrl: "https://market.dam.gov.bd/global/custom_files/daily_price_report.pdf",
    });
    await getKbRuntime().priceStore.addObservations(prices);
    console.log(`Imported ${prices.length} declared-manual DAM observations for ${date}. Review before verification.`);
  } finally { await unlink(output).catch(() => undefined); }
}
main().catch((error) => { console.error("kb-import-dam failed:", error); process.exit(1); });
