import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const baselineMigration = "20260723171000_create_auth_schema";

const firstDeploy = runPrisma(["migrate", "deploy"]);
if (firstDeploy.status === 0) {
  process.exit(0);
}

const deployOutput = `${firstDeploy.stdout ?? ""}\n${firstDeploy.stderr ?? ""}`;
if (!deployOutput.includes("P3005")) {
  process.exit(firstDeploy.status ?? 1);
}

if (!(await hasExistingAuthSchema())) {
  await applyBaselineMigration();
}
if (!(await hasExistingAuthSchema())) {
  throw new Error("Auth schema is incomplete after applying the baseline migration");
}

const resolve = runPrisma(["migrate", "resolve", "--applied", baselineMigration], {
  stdio: "inherit",
});
if (resolve.status !== 0) {
  process.exit(resolve.status ?? 1);
}

const secondDeploy = runPrisma(["migrate", "deploy"], { stdio: "inherit" });
process.exit(secondDeploy.status ?? 1);

function runPrisma(args, options = {}) {
  return spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

function createPrisma() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to baseline Prisma migrations");
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

async function hasExistingAuthSchema() {
  const prisma = createPrisma();

  try {
    const rows = await prisma.$queryRaw`
      SELECT
        to_regclass('public.app_users') IS NOT NULL AS has_app_users,
        to_regclass('public.auth_identities') IS NOT NULL AS has_auth_identities,
        EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = 'auth_identities'
            AND c.contype = 'f'
            AND c.confrelid = to_regclass('public.app_users')
        ) AS has_auth_identity_user_fk
    `;

    const row = rows[0];
    return Boolean(row?.has_app_users && row?.has_auth_identities && row?.has_auth_identity_user_fk);
  } finally {
    await prisma.$disconnect();
  }
}

async function applyBaselineMigration() {
  const prisma = createPrisma();
  const sql = await readFile(
    new URL(`../prisma/migrations/${baselineMigration}/migration.sql`, import.meta.url),
    "utf8",
  );
  // The checked-in baseline consists of ordinary DDL statements and is explicitly
  // idempotent. Execute one statement at a time because prepared queries reject
  // multi-command SQL strings.
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  try {
    for (const statement of statements) await prisma.$executeRawUnsafe(statement);
  } finally {
    await prisma.$disconnect();
  }
}
