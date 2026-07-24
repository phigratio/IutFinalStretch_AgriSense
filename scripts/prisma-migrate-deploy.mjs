import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../dist/generated/prisma/client.js";

const baselineMigration = "20260723171000_create_auth_schema";

// Migrations that, when found in Prisma's "failed" state (P3009), are safe to
// automatically roll back and re-apply. A migration belongs here only if a
// failed attempt committed nothing — e.g. it failed on its first statement
// inside Prisma's per-migration transaction, so the DB was left untouched.
//
// 20260724140105_add_bdapps_channel: an earlier corrupt version referenced
// tables (marketplace_orders, …) that don't exist yet at that point and died on
// the first DROP CONSTRAINT. The file is now fixed, but a database that already
// recorded the failed attempt stays blocked on P3009 until the row is rolled
// back. Auto-recovering it lets the redeploy self-heal.
const rollbackAllowlist = new Set(["20260724140105_add_bdapps_channel"]);

const maxAttempts = 6;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const deploy = runPrisma(["migrate", "deploy"]);
  // Always surface Prisma's output — a swallowed migrate error was previously
  // the reason the container "just exited 1" with empty logs.
  echo(deploy);
  if (deploy.status === 0) process.exit(0);

  const output = `${deploy.stdout ?? ""}\n${deploy.stderr ?? ""}`;

  if (output.includes("P3005")) {
    await recoverFromNonEmptySchema();
    continue;
  }

  if (output.includes("P3009")) {
    const rolledBack = await rollBackSafeFailedMigrations();
    if (rolledBack > 0) continue;
    console.error(
      "P3009: a failed migration is blocking deploy and it is not in the auto-rollback allowlist. " +
        "Resolve it manually: npx prisma migrate resolve --rolled-back <migration_name>",
    );
    process.exit(deploy.status ?? 1);
  }

  process.exit(deploy.status ?? 1);
}

console.error(`prisma migrate deploy did not converge after ${maxAttempts} attempts`);
process.exit(1);

/**
 * P3005 recovery: the database already has our schema but no migration history
 * (e.g. it was created out-of-band). Baseline it against the first migration so
 * `migrate deploy` can take over from there.
 */
async function recoverFromNonEmptySchema() {
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
}

/**
 * P3009 recovery: find migrations Prisma has recorded as failed and, for each
 * one on the allowlist, mark it rolled back so `migrate deploy` re-applies the
 * (now corrected) migration. Returns how many were rolled back.
 */
async function rollBackSafeFailedMigrations() {
  const failed = await listFailedMigrations();
  let rolledBack = 0;
  for (const name of failed) {
    if (!rollbackAllowlist.has(name)) {
      console.error(`Skipping failed migration not on the auto-rollback allowlist: ${name}`);
      continue;
    }
    console.log(`Rolling back failed migration so it can be re-applied: ${name}`);
    const resolve = runPrisma(["migrate", "resolve", "--rolled-back", name], { stdio: "inherit" });
    if (resolve.status !== 0) {
      process.exit(resolve.status ?? 1);
    }
    rolledBack += 1;
  }
  return rolledBack;
}

/** Migration names currently in the failed state (started, not finished, not rolled back). */
async function listFailedMigrations() {
  const prisma = createPrisma();
  try {
    const rows = await prisma.$queryRaw`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;
    return rows.map((row) => row.migration_name);
  } finally {
    await prisma.$disconnect();
  }
}

function runPrisma(args, options = {}) {
  return spawnSync("npx", ["prisma", ...args], {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
}

/** Print a captured (stdio: "pipe") spawn result's output. No-op for inherited stdio. */
function echo(result) {
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
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
