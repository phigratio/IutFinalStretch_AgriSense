/**
 * BDApps phone identity — OTP verification that (a) proves the farmer owns the
 * phone, (b) establishes/links the SHARED AppUser identity (same AuthStore +
 * token as email/password — NOT a separate login silo), and (c) captures the
 * BDApps reach channel when a masked subscriberId is available.
 *
 * Model (see BDAPPS-INTEGRATION-PLAN §1a/§7): this is verification-to-enable-
 * BDApps-features. On web it links a phone to an already-logged-in account; on
 * mobile (which has no login) it doubles as sign-in via the same identity.
 * Additive to Navid's auth: uses the existing upsertOAuthUser provider path.
 */
import { HttpError } from "../middleware/errorHandler.js";
import { bdapps as defaultBdapps, isSuccess, toTelAddress, type BdappsApi } from "../bdapps/index.js";
import { rememberOtpReference, rememberMaskedSubscriber } from "../bdapps/subscriberStore.js";
import { activateChannel, getDefaultChannelStore, type ChannelStore } from "../bdapps/channel.js";
import { AuthService, type AuthResponse } from "./service.js";
import type { AuthStore } from "./store.js";

export interface BdappsVerifyResult extends AuthResponse {
  /** True when a masked subscriberId came back and the SMS/pay channel is now active. */
  channelActive: boolean;
  subscriptionStatus?: string;
}

/** Digits only (e.g. "8801805758966") — stable per-farmer identity key. */
function telDigits(mobile: string): string {
  return toTelAddress(mobile).replace(/^tel:/, "");
}

/** Placeholder email for a phone-only farmer (AppUser.email is unique/non-null). */
function syntheticEmail(mobile: string): string {
  return `${telDigits(mobile)}@bdapps.agrisense.local`;
}

export class BdappsAuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly client: BdappsApi = defaultBdapps,
    private readonly channelStore: ChannelStore = getDefaultChannelStore(),
  ) {}

  /** Send an OTP to the phone; returns the referenceNo to verify against. */
  async requestOtp(mobileRaw: unknown): Promise<{ referenceNo: string }> {
    const mobile = parseMobile(mobileRaw);
    const res = await this.client.requestOtp(mobile);
    if (!isSuccess(res) || !res.referenceNo) {
      throw new HttpError(502, `OTP request failed: ${res.statusDetail ?? res.statusCode}`);
    }
    rememberOtpReference(res.referenceNo, mobile);
    return { referenceNo: res.referenceNo };
  }

  /**
   * Verify the OTP → establish the shared AppUser identity + issue a token.
   * If BDApps returns the masked subscriberId, also activate the reach channel
   * and link it to this user. (Channel may instead activate later via the
   * subscription webhook — identity does not depend on it.)
   */
  async verifyOtp(input: { referenceNo: unknown; otp: unknown; mobile: unknown; name?: unknown }): Promise<BdappsVerifyResult> {
    const referenceNo = parseString(input.referenceNo, "referenceNo");
    const otp = parseString(input.otp, "otp");
    const mobile = parseMobile(input.mobile);

    const res = await this.client.verifyOtp(referenceNo, otp);
    if (!isSuccess(res)) {
      throw new HttpError(401, `OTP verification failed: ${res.statusDetail ?? res.statusCode}`);
    }

    // Identity: create-or-find the shared AppUser keyed by phone (role "user").
    const user = await this.store.upsertOAuthUser({
      provider: "bdapps",
      providerUserId: telDigits(mobile),
      email: syntheticEmail(mobile),
      name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : mobile,
      emailVerified: true,
    });

    // Channel: activate now if the masked id is present (otherwise it arrives
    // later via the subscription webhook — see channel.ts capture points).
    let channelActive = false;
    if (res.subscriberId) {
      rememberMaskedSubscriber(referenceNo, res.subscriberId);
      await activateChannel(
        { mobile, maskedSubscriberId: res.subscriberId, source: "otp_verify", userId: user.id },
        this.channelStore,
      );
      channelActive = true;
    }

    const auth = new AuthService(this.store).createResponse(user);
    return { ...auth, channelActive, subscriptionStatus: res.subscriptionStatus };
  }

  /**
   * Web path: an ALREADY-logged-in user (email/password) verifies their phone to
   * enable BDApps features. Activates the channel on THEIR existing user — no
   * new user, no new token — so it never forks a second account (R3). Returns
   * whether the channel went active.
   */
  async activatePhoneForUser(
    userId: string,
    input: { referenceNo: unknown; otp: unknown; mobile: unknown },
  ): Promise<{ channelActive: boolean; mobile: string; subscriptionStatus?: string }> {
    const referenceNo = parseString(input.referenceNo, "referenceNo");
    const otp = parseString(input.otp, "otp");
    const mobile = parseMobile(input.mobile);

    const res = await this.client.verifyOtp(referenceNo, otp);
    if (!isSuccess(res)) {
      throw new HttpError(401, `OTP verification failed: ${res.statusDetail ?? res.statusCode}`);
    }

    let channelActive = false;
    if (res.subscriberId) {
      rememberMaskedSubscriber(referenceNo, res.subscriberId);
      await activateChannel(
        { mobile, maskedSubscriberId: res.subscriberId, source: "otp_verify", userId },
        this.channelStore,
      );
      channelActive = true;
    }
    return { channelActive, mobile, subscriptionStatus: res.subscriptionStatus };
  }
}

function parseMobile(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, "mobile is required");
  }
  try {
    toTelAddress(value); // validate BD number format
    return value.trim();
  } catch (err) {
    throw new HttpError(400, (err as Error).message);
  }
}

function parseString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}
