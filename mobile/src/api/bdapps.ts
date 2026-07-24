/**
 * bdapps test-console API — wraps the backend's /api/bdapps/* test routes for
 * the on-device dev console (SMS, OTP, balance, PI, charge, subscription).
 * Contract mirrors frontend/src/api/bdapps.ts. Consumed by the Bdapps tab.
 */
import { apiFetch } from "./client";

export type BdappsResult = Record<string, unknown>;

export function sendSms(input: { to: string; message: string }): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/sms", { method: "POST", body: input });
}

export function broadcastSms(message: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/broadcast", { method: "POST", body: { message } });
}

export function requestOtp(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/otp/request", { method: "POST", body: { mobile } });
}

export function verifyOtp(input: { referenceNo: string; otp: string }): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/otp/verify", { method: "POST", body: input });
}

export function queryBalance(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/balance", { method: "POST", body: { mobile } });
}

export function listPaymentInstruments(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/pi", { method: "POST", body: { mobile } });
}

export function charge(input: { mobile: string; amount: number }): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/charge", { method: "POST", body: input });
}

export function subscriptionStatus(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/subscription/status", { method: "POST", body: { mobile } });
}

export function subscribe(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/subscription/subscribe", { method: "POST", body: { mobile } });
}

export function unsubscribe(mobile: string): Promise<BdappsResult> {
  return apiFetch<BdappsResult>("/api/bdapps/subscription/unsubscribe", { method: "POST", body: { mobile } });
}
