/**
 * Mobile auth API — BDApps phone-OTP sign-in. On mobile (which has no other
 * login) phone verification doubles as sign-in via the SHARED backend identity
 * (same AppUser/JWT as web email/Google). See BDAPPS-INTEGRATION-PLAN §1a/§7.
 *   POST /auth/bdapps/otp/request  { mobile } -> { referenceNo }
 *   POST /auth/bdapps/otp/verify   { referenceNo, otp, mobile, name? } -> AuthResult
 *   GET  /auth/me                  -> AuthUser (token-bootstrap on app open)
 */
import { apiFetch } from "./client";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role: "user" | "tenant" | "admin";
}

export interface AuthResult {
  accessToken: string;
  tokenType: "Bearer";
  user: AuthUser;
  channelActive: boolean;
  subscriptionStatus?: string;
}

export function requestOtp(mobile: string): Promise<{ referenceNo: string }> {
  return apiFetch<{ referenceNo: string }>("/auth/bdapps/otp/request", {
    method: "POST",
    body: { mobile },
  });
}

export function verifyOtp(input: {
  referenceNo: string;
  otp: string;
  mobile: string;
  name?: string;
}): Promise<AuthResult> {
  return apiFetch<AuthResult>("/auth/bdapps/otp/verify", { method: "POST", body: input });
}

export function getMe(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/auth/me");
}
