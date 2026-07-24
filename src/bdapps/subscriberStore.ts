/**
 * Maps a farmer's real phone number to the MASKED subscriberId that bdapps
 * returns from OTP verify.
 *
 * WHY THIS EXISTS: for our app config (Subscriber Confirmation Required = YES),
 * bdapps rejects the raw `tel:8801…` address on SMS / CaaS / subscription calls
 * with E1951 ("Format of the address is invalid Or User Already UnRegistered")
 * — even after the subscriber is REGISTERED. Only the masked id from
 * `otp/verify` is accepted. So we remember it once (at OTP verify) and reuse it
 * for every later call to that farmer.
 *
 * Consumed by: routes/bdappsListeners+bdappsTest (resolve subscriber address),
 * payments/service.ts (SMS receipt + debit target). In-memory is fine for the
 * demo; a farmer verifies once per session.
 */
import { toTelAddress } from "./phone.js";

/** normalized raw address (tel:8801…) -> masked subscriberId (tel:MDUz…) */
const maskedByRaw = new Map<string, string>();
/** OTP referenceNo -> normalized raw address, set at request, read at verify. */
const rawByReference = new Map<string, string>();

/** Remember which number an OTP referenceNo belongs to (call at otp/request). */
export function rememberOtpReference(referenceNo: string, rawMobile: string): void {
  try {
    rawByReference.set(referenceNo, toTelAddress(rawMobile));
  } catch {
    /* ignore un-normalizable input; verify will simply have no mapping */
  }
}

/** Store the masked id returned by otp/verify against its original number. */
export function rememberMaskedSubscriber(referenceNo: string, maskedSubscriberId: string): void {
  const raw = rawByReference.get(referenceNo);
  if (raw && maskedSubscriberId.startsWith("tel:")) {
    maskedByRaw.set(raw, maskedSubscriberId);
  }
}

/** Directly remember a masked id for a number (when both are already known). */
export function setMaskedSubscriber(rawMobile: string, maskedSubscriberId: string): void {
  try {
    if (maskedSubscriberId.startsWith("tel:")) {
      maskedByRaw.set(toTelAddress(rawMobile), maskedSubscriberId);
    }
  } catch {
    /* ignore */
  }
}

/** The masked id for a number, if we've captured one; else undefined. */
export function getMaskedSubscriber(rawMobile: string): string | undefined {
  try {
    return maskedByRaw.get(toTelAddress(rawMobile));
  } catch {
    return undefined;
  }
}

/**
 * The address to send to bdapps for this number: the masked id when known
 * (required for SMS/CaaS/subscription on this app), else the normalized raw
 * `tel:` address. A value already in `tel:` form (a masked id itself) passes
 * through unchanged.
 */
export function resolveSubscriberAddress(mobile: string): string {
  if (mobile.trim().toLowerCase().startsWith("tel:")) return mobile.trim();
  return getMaskedSubscriber(mobile) ?? toTelAddress(mobile);
}
