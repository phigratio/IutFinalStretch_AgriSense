import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: "user" | "tenant" | "admin";
  exp: number;
}

function encode(input: unknown): string {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function sign(unsignedToken: string): string {
  return createHmac("sha256", config.authTokenSecret).update(unsignedToken).digest("base64url");
}

export function createAuthToken(input: {
  userId: string;
  email: string;
  role: "user" | "tenant" | "admin";
}): string {
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    sub: input.userId,
    email: input.email,
    role: input.role,
    exp: Math.floor(Date.now() / 1000) + config.authTokenTtlSeconds,
  } satisfies AuthTokenPayload);
  const unsignedToken = `${header}.${payload}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | undefined {
  const [header, payload, signature] = token.split(".");
  if (!header || !payload || !signature) {
    return undefined;
  }

  const unsignedToken = `${header}.${payload}`;
  const expected = Buffer.from(sign(unsignedToken));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AuthTokenPayload;
    if (decoded.exp <= Math.floor(Date.now() / 1000)) {
      return undefined;
    }

    return decoded;
  } catch {
    return undefined;
  }
}
