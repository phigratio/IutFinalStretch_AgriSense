import { spawnSync } from "node:child_process";
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

await assertExistingAuthSchema();

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

async function assertExistingAuthSchema() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to baseline Prisma migrations");
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

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
            AND c.confrelid = 'app_users'::regclass
        ) AS has_auth_identity_user_fk
    `;

    const row = rows[0];
    if (!row?.has_app_users || !row?.has_auth_identities || !row?.has_auth_identity_user_fk) {
      throw new Error(
        "Refusing to baseline Prisma migration because the existing auth schema is incomplete",
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}
