/** Idempotently seed the reserved hub and the Kushtia demo tenant. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { config } from "../src/config.js";

async function main(): Promise<void> {
  if (!config.databaseUrl) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  try {
    await prisma.tenant.upsert({
      where: { slug: "hub" },
      update: { name: "AgriSense Knowledge Hub", kind: "hub" },
      create: { slug: "hub", name: "AgriSense Knowledge Hub", kind: "hub" },
    });
    const kushtia = await prisma.tenant.upsert({
      where: { slug: "dist-kushtia" },
      update: { name: "Kushtia District Office", kind: "district" },
      create: { slug: "dist-kushtia", name: "Kushtia District Office", kind: "district" },
    });
    const jurisdiction = await prisma.tenantJurisdiction.findFirst({
      where: { tenantId: kushtia.id, district: { equals: "Kushtia", mode: "insensitive" }, upazila: null },
    });
    if (!jurisdiction) {
      await prisma.tenantJurisdiction.create({
        data: { tenantId: kushtia.id, district: "Kushtia" },
      });
    }
    console.log("Seeded tenants: hub, dist-kushtia (Kushtia)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("seed-tenants failed:", error);
  process.exit(1);
});
