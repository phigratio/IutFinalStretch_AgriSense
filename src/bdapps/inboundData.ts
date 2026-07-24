/**
 * Postgres-backed data lookups for the inbound-SMS keyword router (P4).
 * Resolves a farmer by their masked subscriberId, then builds compact one-line
 * PLAN / WEATHER replies. Best-effort: any miss returns undefined so the
 * router falls back to a helpful default. Consumed by routes/bdappsListeners.ts.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { getWeatherForecast } from "../agrisense/weatherTool.js";
import type { InboundData } from "./inboundSms.js";

const tk = (n: number) => `Tk ${Math.round(n).toLocaleString("en-IN")}`;

export class PostgresInboundData implements InboundData {
  private prisma: PrismaClient;
  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  private async latestFarm(subscriberId: string) {
    const farmer = await this.prisma.farmerProfile.findFirst({
      where: { bdappsSubscriberId: subscriberId },
    });
    if (!farmer) return undefined;
    return this.prisma.farmProfile.findFirst({
      where: { farmerId: farmer.id },
      orderBy: { updatedAt: "desc" },
    });
  }

  async planSummary(subscriberId: string): Promise<string | undefined> {
    const farm = await this.latestFarm(subscriberId);
    if (!farm) return undefined;
    const plan = await this.prisma.seasonPlan.findFirst({
      where: { farmId: farm.id },
      orderBy: { createdAt: "desc" },
    });
    if (!plan) return undefined;
    return `AgriSense: ${plan.crop} plan — expected net ${tk(Number(plan.netProfitBdt))}, ROI ${Math.round(Number(plan.roiPct))}%. Open the app for the full calendar.`;
  }

  async weatherSummary(subscriberId: string): Promise<string | undefined> {
    const farm = await this.latestFarm(subscriberId);
    if (!farm?.locationText) return undefined;
    try {
      const forecast = await getWeatherForecast(farm.locationText);
      const d = forecast.daily[0];
      if (!d) return undefined;
      return `AgriSense weather (${forecast.locationText}): today ${d.rainfallMm}mm rain, ${d.temperatureMinC}-${d.temperatureMaxC}C.`;
    } catch {
      return undefined;
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

let defaultInboundData: InboundData | undefined;

/** Postgres provider when DATABASE_URL is set, else undefined (replies fall back). */
export function getDefaultInboundData(): InboundData | undefined {
  if (!config.databaseUrl) return undefined;
  defaultInboundData ??= new PostgresInboundData(config.databaseUrl);
  return defaultInboundData;
}
