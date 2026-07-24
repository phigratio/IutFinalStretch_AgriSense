/**
 * BDApps integration — public surface.
 *
 *   import { bdapps } from "./bdapps/index.js";
 *   const res = await bdapps.sendSms("01812345678", "hi");
 *   if (isSuccess(res)) { ... }
 *
 * `bdapps` is the REAL sandbox client by default; set MOCK_BDAPPS=1 in .env to
 * swap in the offline mock (same method surface, responses tagged mock:true).
 * Consumed by: payments checkout (P-1), agent tools (send_sms), CLI, test routes.
 */
import { bdapps as realBdapps, BdappsClient } from "./client.js";
import { mockBdapps } from "./mock.js";

/** The method surface shared by the real client and the mock. */
export type BdappsApi = Pick<
  BdappsClient,
  | "sendSms"
  | "broadcastSms"
  | "sendUssd"
  | "queryBalance"
  | "listPaymentInstruments"
  | "directDebit"
  | "requestOtp"
  | "verifyOtp"
  | "getSubscriptionStatus"
  | "subscribe"
  | "unsubscribe"
>;

/** True when MOCK_BDAPPS=1 — README/demo must declare mock usage honestly. */
export const isBdappsMocked = process.env.MOCK_BDAPPS === "1";

export const bdapps: BdappsApi = isBdappsMocked ? mockBdapps : realBdapps;

export {
  BdappsClient,
  BdappsError,
  isSuccess,
  type SendSmsOptions,
  type SendUssdParams,
  type DirectDebitParams,
  type OtpMeta,
} from "./client.js";
export { MockBdappsClient, mockBdapps } from "./mock.js";
export { toTelAddress } from "./phone.js";
export { bdappsConfig, type BdappsConfig } from "./config.js";
export { handleUssd, type UssdReply } from "./ussdMenu.js";
export type * from "./types.js";
