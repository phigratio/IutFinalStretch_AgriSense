/**
 * Persistence for bdapps CaaS payments (bdapps_payments table).
 * Postgres backs the demo; the in-memory store keeps checkout tests fast.
 * Consumed by: payments/service.ts (checkout flow, P-1) and routes/payments.ts.
 * Pattern mirrors agrisense/agrisenseStore.ts (interface + InMemory + Postgres + default picker).
 */
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import { PrismaClient, type Prisma } from "../generated/prisma/client.js";

export interface PaymentRecord {
  id: string;
  mobile: string;
  amountBdt: number;
  status: "pending" | "success" | "insufficient" | "failed";
  planId?: string;
  userId?: string;
  externalReference?: string;
  receiptNumber?: string;
  requestPayload: Record<string, unknown>;
  responsePayload?: unknown;
  createdAt: string;
}

export interface CreatePaymentInput {
  mobile: string;
  amountBdt: number;
  planId?: string;
  userId?: string;
  requestPayload: Record<string, unknown>;
}

export interface CompletePaymentInput {
  status: PaymentRecord["status"];
  responsePayload?: unknown;
  externalReference?: string;
  receiptNumber?: string;
}

export interface PaymentStore {
  createPayment(input: CreatePaymentInput): Promise<PaymentRecord>;
  completePayment(id: string, input: CompletePaymentInput): Promise<void>;
  getPayment(id: string): Promise<PaymentRecord | undefined>;
  close?(): Promise<void>;
}

export class InMemoryPaymentStore implements PaymentStore {
  readonly payments = new Map<string, PaymentRecord>();

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const record: PaymentRecord = {
      id: randomUUID(),
      mobile: input.mobile,
      amountBdt: input.amountBdt,
      status: "pending",
      planId: input.planId,
      userId: input.userId,
      requestPayload: input.requestPayload,
      createdAt: new Date().toISOString(),
    };
    this.payments.set(record.id, record);
    return record;
  }

  async completePayment(id: string, input: CompletePaymentInput): Promise<void> {
    const record = this.payments.get(id);
    if (!record) throw new Error(`Unknown payment ${id}`);
    Object.assign(record, input);
  }

  async getPayment(id: string): Promise<PaymentRecord | undefined> {
    return this.payments.get(id);
  }
}

export class PostgresPaymentStore implements PaymentStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentRecord> {
    const row = await this.prisma.bdappsPayment.create({
      data: {
        mobile: input.mobile,
        amountBdt: input.amountBdt,
        planId: input.planId,
        userId: input.userId,
        status: "pending",
        requestPayload: input.requestPayload as Prisma.InputJsonValue,
      },
    });
    return this.toRecord(row);
  }

  async completePayment(id: string, input: CompletePaymentInput): Promise<void> {
    await this.prisma.bdappsPayment.update({
      where: { id },
      data: {
        status: input.status,
        responsePayload:
          input.responsePayload === undefined
            ? undefined
            : (input.responsePayload as Prisma.InputJsonValue),
        externalReference: input.externalReference,
        receiptNumber: input.receiptNumber,
      },
    });
  }

  async getPayment(id: string): Promise<PaymentRecord | undefined> {
    const row = await this.prisma.bdappsPayment.findUnique({ where: { id } });
    return row ? this.toRecord(row) : undefined;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private toRecord(row: {
    id: string;
    mobile: string;
    amountBdt: Prisma.Decimal;
    status: string;
    planId: string | null;
    userId: string | null;
    externalReference: string | null;
    receiptNumber: string | null;
    requestPayload: Prisma.JsonValue;
    responsePayload: Prisma.JsonValue | null;
    createdAt: Date;
  }): PaymentRecord {
    return {
      id: row.id,
      mobile: row.mobile,
      amountBdt: Number(row.amountBdt),
      status: row.status as PaymentRecord["status"],
      planId: row.planId ?? undefined,
      userId: row.userId ?? undefined,
      externalReference: row.externalReference ?? undefined,
      receiptNumber: row.receiptNumber ?? undefined,
      requestPayload: (row.requestPayload ?? {}) as Record<string, unknown>,
      responsePayload: row.responsePayload ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

let defaultPaymentStore: PaymentStore | undefined;

/** Postgres when DATABASE_URL is set, otherwise in-memory (tests / early dev). */
export function getDefaultPaymentStore(): PaymentStore {
  defaultPaymentStore ??= config.databaseUrl
    ? new PostgresPaymentStore(config.databaseUrl)
    : new InMemoryPaymentStore();
  return defaultPaymentStore;
}
