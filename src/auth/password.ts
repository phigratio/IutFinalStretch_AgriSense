import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const keyLength = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derivedKey = (await scryptAsync(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [algorithm, salt, encodedHash] = hash.split("$");
  if (algorithm !== "scrypt" || !salt || !encodedHash) {
    return false;
  }

  const expected = Buffer.from(encodedHash, "base64url");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
