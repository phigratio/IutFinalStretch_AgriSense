import { DuplicateEmailError, type AuthStore, type AuthUser } from "./store.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createAuthToken } from "./tokens.js";
import { HttpError } from "../middleware/errorHandler.js";

const minPasswordLength = 8;

export interface AuthResponse {
  accessToken: string;
  tokenType: "Bearer";
  user: PublicAuthUser;
}

export interface PublicAuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export class AuthService {
  constructor(private readonly store: AuthStore) {}

  async initialize(): Promise<void> {
    await this.store.initialize();
  }

  async signup(input: { email: unknown; name: unknown; password: unknown }): Promise<AuthResponse> {
    const email = parseEmail(input.email);
    const name = parseName(input.name);
    const password = parsePassword(input.password);

    try {
      const user = await this.store.createPasswordUser({
        email,
        name,
        passwordHash: await hashPassword(password),
      });
      return this.createResponse(user);
    } catch (error) {
      if (error instanceof DuplicateEmailError) {
        throw new HttpError(409, error.message);
      }
      throw error;
    }
  }

  async login(input: { email: unknown; password: unknown }): Promise<AuthResponse> {
    const email = parseEmail(input.email);
    const password = parsePassword(input.password);
    const user = await this.store.findUserByEmail(email);

    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    return this.createResponse(user);
  }

  async getUser(userId: string): Promise<PublicAuthUser> {
    const user = await this.store.findUserById(userId);
    if (!user) {
      throw new HttpError(401, "Invalid authentication token");
    }
    return toPublicUser(user);
  }

  createResponse(user: AuthUser): AuthResponse {
    return {
      accessToken: createAuthToken({ userId: user.id, email: user.email }),
      tokenType: "Bearer",
      user: toPublicUser(user),
    };
  }
}

export function toPublicUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
  };
}

function parseEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "Email is required");
  }
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, "Email must be valid");
  }
  return email;
}

function parseName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 1) {
    throw new HttpError(400, "Name is required");
  }
  return value.trim();
}

function parsePassword(value: unknown): string {
  if (typeof value !== "string" || value.length < minPasswordLength) {
    throw new HttpError(400, `Password must be at least ${minPasswordLength} characters`);
  }
  return value;
}
