import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "../config.js";

export interface KbDocumentRecord {
  tenantId: string;
  scope: "hub" | "tenant";
  docKey: string;
  title: string;
  source: string;
  sourceUrl?: string;
  imageUrl?: string;
  page?: string;
  cropId?: string;
  mem0Ids: string[];
  dataOrigin: string;
  verificationStatus: "verified" | "cross_checked" | "unverified";
  retrievedAt?: string;
}

export interface KbDocumentStore {
  upsert(document: KbDocumentRecord): Promise<void>;
  list(tenantId: string): Promise<KbDocumentRecord[]>;
}

export class InMemoryKbDocumentStore implements KbDocumentStore {
  private rows = new Map<string, KbDocumentRecord>();

  async upsert(document: KbDocumentRecord): Promise<void> {
    const key = `${document.tenantId}:${document.docKey}`;
    const old = this.rows.get(key);
    this.rows.set(key, {
      ...document,
      mem0Ids: [...new Set([...(old?.mem0Ids ?? []), ...document.mem0Ids])],
    });
  }

  async list(tenantId: string): Promise<KbDocumentRecord[]> {
    return [...this.rows.values()].filter((row) => row.tenantId === tenantId);
  }
}

export class PrismaKbDocumentStore implements KbDocumentStore {
  private prisma: PrismaClient;
  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async upsert(d: KbDocumentRecord): Promise<void> {
    const existing = await this.prisma.kbDocument.findUnique({
      where: { tenantId_docKey: { tenantId: d.tenantId, docKey: d.docKey } },
      select: { mem0Ids: true },
    });
    const mem0Ids = [...new Set([...(existing?.mem0Ids ?? []), ...d.mem0Ids])];
    await this.prisma.kbDocument.upsert({
      where: { tenantId_docKey: { tenantId: d.tenantId, docKey: d.docKey } },
      update: { ...d, sourceUrl: d.sourceUrl ?? null, imageUrl: d.imageUrl ?? null, page: d.page ?? null, cropId: d.cropId ?? null, retrievedAt: d.retrievedAt ? new Date(d.retrievedAt) : null, mem0Ids },
      create: { ...d, sourceUrl: d.sourceUrl ?? null, imageUrl: d.imageUrl ?? null, page: d.page ?? null, cropId: d.cropId ?? null, retrievedAt: d.retrievedAt ? new Date(d.retrievedAt) : null, mem0Ids },
    });
  }

  async list(tenantId: string): Promise<KbDocumentRecord[]> {
    const rows = await this.prisma.kbDocument.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
    return rows.map((d) => ({ ...d, scope: d.scope as "hub" | "tenant", verificationStatus: d.verificationStatus as KbDocumentRecord["verificationStatus"], sourceUrl: d.sourceUrl ?? undefined, imageUrl: d.imageUrl ?? undefined, page: d.page ?? undefined, cropId: d.cropId ?? undefined, retrievedAt: d.retrievedAt?.toISOString() }));
  }
}

let defaultStore: KbDocumentStore | undefined;
export function getKbDocumentStore(): KbDocumentStore {
  defaultStore ??= config.databaseUrl
    ? new PrismaKbDocumentStore(config.databaseUrl)
    : new InMemoryKbDocumentStore();
  return defaultStore;
}
