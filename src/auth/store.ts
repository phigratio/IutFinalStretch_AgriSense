import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "../config.js";
import {
  Prisma,
  PrismaClient,
  type AppUser as PrismaAppUser,
} from "../generated/prisma/client.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  passwordHash?: string;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePasswordUserInput {
  email: string;
  name: string;
  passwordHash: string;
}

export interface UpsertOAuthUserInput {
  provider: "google";
  providerUserId: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface AuthStore {
  initialize(): Promise<void>;
  findUserByEmail(email: string): Promise<AuthUser | undefined>;
  findUserById(id: string): Promise<AuthUser | undefined>;
  createPasswordUser(input: CreatePasswordUserInput): Promise<AuthUser>;
  upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AuthUser>;
  /** Admin panel: all users, newest first. */
  listUsers(): Promise<AuthUser[]>;
  /** Admin panel: remove a user. Resolves false when the id is unknown. */
  deleteUser(id: string): Promise<boolean>;
  reset?(): Promise<void>;
  close?(): Promise<void>;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function now(): string {
  return new Date().toISOString();
}

export class InMemoryAuthStore implements AuthStore {
  private users = new Map<string, AuthUser>();
  private identities = new Map<string, string>();

  async initialize(): Promise<void> {}

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const normalizedEmail = normalizeEmail(email);
    return [...this.users.values()].find((user) => user.email === normalizedEmail);
  }

  async findUserById(id: string): Promise<AuthUser | undefined> {
    return this.users.get(id);
  }

  async createPasswordUser(input: CreatePasswordUserInput): Promise<AuthUser> {
    if (await this.findUserByEmail(input.email)) {
      throw new DuplicateEmailError();
    }

    const timestamp = now();
    const user: AuthUser = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      passwordHash: input.passwordHash,
      emailVerified: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(user.id, user);
    return user;
  }

  async upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AuthUser> {
    const identityKey = `${input.provider}:${input.providerUserId}`;
    const existingUserId = this.identities.get(identityKey);
    if (existingUserId) {
      const user = this.users.get(existingUserId);
      if (user) {
        return user;
      }
    }

    const existingUser = await this.findUserByEmail(input.email);
    if (existingUser) {
      this.identities.set(identityKey, existingUser.id);
      return existingUser;
    }

    const timestamp = now();
    const user: AuthUser = {
      id: randomUUID(),
      email: normalizeEmail(input.email),
      name: input.name.trim(),
      emailVerified: input.emailVerified,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.users.set(user.id, user);
    this.identities.set(identityKey, user.id);
    return user;
  }

  async listUsers(): Promise<AuthUser[]> {
    return [...this.users.values()].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }

  async deleteUser(id: string): Promise<boolean> {
    if (!this.users.delete(id)) {
      return false;
    }
    for (const [key, userId] of this.identities) {
      if (userId === id) {
        this.identities.delete(key);
      }
    }
    return true;
  }

  async reset(): Promise<void> {
    this.users.clear();
    this.identities.clear();
  }
}

export class DuplicateEmailError extends Error {
  constructor() {
    super("Email is already registered");
    this.name = "DuplicateEmailError";
  }
}

export class PostgresAuthStore implements AuthStore {
  private prisma: PrismaClient;

  constructor(databaseUrl: string) {
    this.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async initialize(): Promise<void> {
    await this.prisma.$connect();
  }

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const user = await this.prisma.appUser.findUnique({
      where: { email: normalizeEmail(email) },
    });
    return user ? mapUser(user) : undefined;
  }

  async findUserById(id: string): Promise<AuthUser | undefined> {
    const user = await this.prisma.appUser.findUnique({ where: { id } });
    return user ? mapUser(user) : undefined;
  }

  async createPasswordUser(input: CreatePasswordUserInput): Promise<AuthUser> {
    try {
      const user = await this.prisma.appUser.create({
        data: {
          email: normalizeEmail(input.email),
          name: input.name.trim(),
          passwordHash: input.passwordHash,
          emailVerified: false,
        },
      });
      return mapUser(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateEmailError();
      }
      throw error;
    }
  }

  async upsertOAuthUser(input: UpsertOAuthUserInput): Promise<AuthUser> {
    const existingIdentity = await this.prisma.authIdentity.findUnique({
      where: {
        provider_providerUserId: {
          provider: input.provider,
          providerUserId: input.providerUserId,
        },
      },
      include: { user: true },
    });
    if (existingIdentity) {
      return mapUser(existingIdentity.user);
    }

    return this.prisma.$transaction(async (tx) => {
      const normalizedEmail = normalizeEmail(input.email);
      const existingUser = await tx.appUser.findUnique({ where: { email: normalizedEmail } });
      const user =
        existingUser ??
        (await tx.appUser.create({
          data: {
            email: normalizedEmail,
            name: input.name.trim(),
            emailVerified: input.emailVerified,
          },
        }));

      await tx.authIdentity.upsert({
        where: {
          provider_providerUserId: {
            provider: input.provider,
            providerUserId: input.providerUserId,
          },
        },
        update: { userId: user.id },
        create: {
          provider: input.provider,
          providerUserId: input.providerUserId,
          userId: user.id,
        },
      });

      return mapUser(user);
    });
  }

  async listUsers(): Promise<AuthUser[]> {
    const users = await this.prisma.appUser.findMany({
      orderBy: { createdAt: "desc" },
    });
    return users.map(mapUser);
  }

  async deleteUser(id: string): Promise<boolean> {
    try {
      await this.prisma.appUser.delete({ where: { id } });
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

function mapUser(row: PrismaAppUser): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    passwordHash: row.passwordHash ?? undefined,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

let defaultAuthStore: AuthStore | undefined;

export function getDefaultAuthStore(): AuthStore {
  defaultAuthStore ??= config.databaseUrl
    ? new PostgresAuthStore(config.databaseUrl)
    : new InMemoryAuthStore();
  return defaultAuthStore;
}
