import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { config } from "../src/config.js";
import { buildSystemStats } from "../src/routes/stats.js";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.databaseUrl! }) });
buildSystemStats(prisma).then((s) => {
  console.log("counts:", s.counts);
  console.log("totals:", s.totals);
  console.log("usersByRole:", s.usersByRole);
  console.log("plansByCrop:", s.plansByCrop);
  console.log("alertsBySeverity:", s.alertsBySeverity);
  console.log("recentPlans[0]:", s.recentPlans[0]);
  process.exit(0);
}).catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
