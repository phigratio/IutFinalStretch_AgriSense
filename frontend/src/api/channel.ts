import { apiFetch } from "./client.js";

/**
 * BDApps "channel activation" for the logged-in farmer: verify the phone so
 * AgriSense can reach them by SMS (weather/pest alerts, receipts). This does
 * NOT create a new account — it activates the channel on the current user.
 * See docs/plans/BDAPPS-INTEGRATION-PLAN.md §1a.
 */

export interface ChannelStatus {
  active: boolean;
  premium: boolean;
  maskedSubscriberId?: string;
  activatedAt?: string;
}

export interface VerifyPhoneResult {
  channelActive: boolean;
  mobile: string;
  subscriptionStatus?: string;
}

/** Is BDApps able to reach this number right now? */
export function getChannelStatus(mobile: string): Promise<ChannelStatus> {
  return apiFetch<ChannelStatus>(`/api/channel/status?mobile=${encodeURIComponent(mobile)}`);
}

/** Send an OTP to the farmer's phone; returns a referenceNo to verify against. */
export function requestBdappsOtp(mobile: string): Promise<{ referenceNo: string }> {
  return apiFetch<{ referenceNo: string }>("/auth/bdapps/otp/request", {
    method: "POST",
    body: { mobile },
  });
}

/** Verify the code → activate the SMS/pay channel on the current account. */
export function verifyPhone(input: { referenceNo: string; otp: string; mobile: string }): Promise<VerifyPhoneResult> {
  return apiFetch<VerifyPhoneResult>("/auth/bdapps/verify-phone", {
    method: "POST",
    body: input,
  });
}
