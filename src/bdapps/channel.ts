/**
 * BDApps "channel activation" — the single source of truth for whether we can
 * reach a farmer through BDApps (SMS / CaaS / subscription).
 *
 * See docs/plans/BDAPPS-INTEGRATION-PLAN.md §1a: the masked `subscriberId` is
 * the reach credential. It is NOT obtained at login — it is captured when the
 * farmer takes a consent action, in order of reliability:
 *   1. subscription-notification webhook (canonical, on confirmation)
 *   2. inbound SMS / USSD sourceAddress (user-initiated opt-in)
 *   3. OTP verify response (optional per DGD §6.3.2)
 *
 * This module persists the credential to FarmerProfile.bdappsSubscriberId
 * (durable, survives restarts) AND write-throughs to subscriberStore (the
 * in-memory resolver used by outbound calls). Consumed by: bdapps listeners
 * (capture), payments/service + smsDispatcher (reach), routes/channel (status).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient } from "../generated/prisma/client.js";
import { setMaskedSubscriber, getMaskedSubscriber } from "./subscriberStore.js";
import { toTelAddress } from "./phone.js";

export type ChannelSource = "subscription_webhook" | "inbound_sms" | "inbound_ussd" | "otp_verify";

export interface ChannelStatus {
  active: boolean;
  premium: boolean;
  maskedSubscriberId?: string;
  activatedAt?: string;
  channelSource?: ChannelSource;
}

export interface ChannelStore {
  activate(input: {
    mobile?: string;
    maskedSubscriberId: string;
    source: ChannelSource;
    premium?: boolean;
  }): Promise<ChannelStatus>;
  setPremium(mobile: string, premium: boolean): Promise<void>;
  getByMobile(mobile: string): Promise<ChannelStatus | undefined>;
  getBySubscriberId(maskedSubscriberId: string): Promise<ChannelStatus | undefined>;
}

/** Prisma-backed channel store; upserts onto the farmer's profile by number/masked id. */
export class PostgresChannelStore implements ChannelStore {
  private prisma: PrismaClient;
  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async activate(input: {
    mobile?: string;
    maskedSubscriberId: string;
    source: ChannelSource;
    premium?: boolean;
  }): Promise<ChannelStatus> {
    // Always cache in the in-memory resolver so outbound calls work immediately.
    if (input.mobile) setMaskedSubscriber(input.mobile, input.maskedSubscriberId);

    const now = new Date();
    // Find the farmer by mobile first, then by an already-stored masked id.
    const normalized = input.mobile ? safeTel(input.mobile) : undefined;
    const existing = await this.prisma.farmerProfile.findFirst({
      where: {
        OR: [
          normalized ? { bdappsMobile: normalized } : undefined,
          normalized ? { bdappsMobile: input.mobile } : undefined,
          { bdappsSubscriberId: input.maskedSubscriberId },
        ].filter(Boolean) as object[],
      },
    });

    const data = {
      bdappsSubscriberId: input.maskedSubscriberId,
      channelActivatedAt: now,
      ...(input.premium !== undefined
        ? { premium: input.premium, premiumSince: input.premium ? now : null }
        : {}),
    };

    const row = existing
      ? await this.prisma.farmerProfile.update({ where: { id: existing.id }, data })
      : await this.prisma.farmerProfile.create({
          data: { bdappsMobile: normalized ?? input.mobile, ...data },
        });

    return toStatus(row, input.source);
  }

  async setPremium(mobile: string, premium: boolean): Promise<void> {
    const normalized = safeTel(mobile) ?? mobile;
    const now = new Date();
    await this.prisma.farmerProfile.updateMany({
      where: { OR: [{ bdappsMobile: normalized }, { bdappsMobile: mobile }] },
      data: { premium, premiumSince: premium ? now : null },
    });
  }

  async getByMobile(mobile: string): Promise<ChannelStatus | undefined> {
    const normalized = safeTel(mobile) ?? mobile;
    const row = await this.prisma.farmerProfile.findFirst({
      where: { OR: [{ bdappsMobile: normalized }, { bdappsMobile: mobile }] },
    });
    return row ? toStatus(row) : undefined;
  }

  async getBySubscriberId(maskedSubscriberId: string): Promise<ChannelStatus | undefined> {
    const row = await this.prisma.farmerProfile.findFirst({
      where: { bdappsSubscriberId: maskedSubscriberId },
    });
    return row ? toStatus(row) : undefined;
  }
}

/** In-memory channel store for tests / DB-less dev. */
export class InMemoryChannelStore implements ChannelStore {
  readonly byMobile = new Map<string, ChannelStatus>();

  async activate(input: {
    mobile?: string;
    maskedSubscriberId: string;
    source: ChannelSource;
    premium?: boolean;
  }): Promise<ChannelStatus> {
    if (input.mobile) setMaskedSubscriber(input.mobile, input.maskedSubscriberId);
    const key = input.mobile ? safeTel(input.mobile) ?? input.mobile : input.maskedSubscriberId;
    const status: ChannelStatus = {
      active: true,
      premium: input.premium ?? this.byMobile.get(key)?.premium ?? false,
      maskedSubscriberId: input.maskedSubscriberId,
      activatedAt: new Date().toISOString(),
      channelSource: input.source,
    };
    this.byMobile.set(key, status);
    return status;
  }

  async setPremium(mobile: string, premium: boolean): Promise<void> {
    const key = safeTel(mobile) ?? mobile;
    const current = this.byMobile.get(key);
    if (current) this.byMobile.set(key, { ...current, premium });
  }

  async getByMobile(mobile: string): Promise<ChannelStatus | undefined> {
    return this.byMobile.get(safeTel(mobile) ?? mobile);
  }

  async getBySubscriberId(maskedSubscriberId: string): Promise<ChannelStatus | undefined> {
    return [...this.byMobile.values()].find((s) => s.maskedSubscriberId === maskedSubscriberId);
  }
}

function toStatus(
  row: {
    bdappsSubscriberId: string | null;
    channelActivatedAt: Date | null;
    premium: boolean;
  },
  source?: ChannelSource,
): ChannelStatus {
  return {
    active: Boolean(row.bdappsSubscriberId),
    premium: row.premium,
    maskedSubscriberId: row.bdappsSubscriberId ?? undefined,
    activatedAt: row.channelActivatedAt?.toISOString(),
    channelSource: source,
  };
}

function safeTel(mobile: string): string | undefined {
  try {
    return toTelAddress(mobile);
  } catch {
    return undefined;
  }
}

let defaultChannelStore: ChannelStore | undefined;

export function getDefaultChannelStore(): ChannelStore {
  defaultChannelStore ??= config.databaseUrl
    ? new PostgresChannelStore(config.databaseUrl)
    : new InMemoryChannelStore();
  return defaultChannelStore;
}

/**
 * Capture the masked subscriberId for a farmer (the channel-activation write
 * path). Idempotent; safe to call from every capture point.
 */
export async function activateChannel(
  input: { mobile?: string; maskedSubscriberId: string; source: ChannelSource; premium?: boolean },
  store: ChannelStore = getDefaultChannelStore(),
): Promise<ChannelStatus> {
  return store.activate(input);
}

/** Is BDApps able to reach this number right now? (masked id known.) */
export async function isChannelActive(
  mobile: string,
  store: ChannelStore = getDefaultChannelStore(),
): Promise<boolean> {
  if (getMaskedSubscriber(mobile)) return true; // in-memory / env-seed fast path
  return Boolean((await store.getByMobile(mobile))?.active);
}
