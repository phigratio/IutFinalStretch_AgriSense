/** Report verification coverage for prose sources and structured CSV rows. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "../src/data/loader.js";

type Status = "verified" | "cross_checked" | "unverified" | "missing";
const counts: Record<Status, number> = { verified: 0, cross_checked: 0, unverified: 0, missing: 0 };
const problems: string[] = [];

function value(text: string, key: string): string | undefined {
  return text.match(new RegExp(`^${key}:\\s*(.+)$`, "mi"))?.[1]?.trim();
}

for (const name of readdirSync("kb-sources/prose").filter((file) => file.endsWith(".md"))) {
  const text = readFileSync(join("kb-sources/prose", name), "utf8");
  const status = (value(text, "verification_status") ?? "missing") as Status;
  counts[status] = (counts[status] ?? 0) + 1;
  const page = value(text, "page") ?? value(text, "pages");
  if (status === "unverified" || status === "missing") problems.push(`prose/${name}: ${status}`);
  if (status === "verified" && !page && !value(text, "url")) problems.push(`prose/${name}: verified without page or URL`);
}

for (const name of readdirSync("src/data").filter((file) => file.endsWith(".csv"))) {
  for (const [index, row] of parseCsv(readFileSync(join("src/data", name), "utf8")).entries()) {
    const rawStatus = row.verification_status || "missing";
    const status = (["verified", "cross_checked", "unverified"].includes(rawStatus) ? rawStatus : "missing") as Status;
    counts[status]++;
    if (status === "missing" && rawStatus !== "missing") problems.push(`src/data/${name}:${index + 2}: invalid status ${rawStatus}`);
    if (status === "unverified" || status === "missing") problems.push(`src/data/${name}:${index + 2}: ${status}`);
    if (row.page?.toUpperCase() === "TODO") problems.push(`src/data/${name}:${index + 2}: page TODO`);
  }
}

console.table(counts);
console.log(`Verification issues: ${problems.length}`);
for (const problem of problems.slice(0, 30)) console.log(`- ${problem}`);
if (problems.length > 30) console.log(`- …and ${problems.length - 30} more`);
if (process.argv.includes("--strict") && problems.length) process.exit(1);
