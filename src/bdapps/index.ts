/**
 * BDApps integration — public surface.
 *
 *   import { bdapps } from "./bdapps/index.js";
 *   const res = await bdapps.sendSms("01812345678", "hi");
 *   if (isSuccess(res)) { ... }
 */
export {
  bdapps,
  BdappsClient,
  BdappsError,
  isSuccess,
  type SendSmsOptions,
  type SendUssdParams,
  type DirectDebitParams,
  type OtpMeta,
} from "./client.js";
export { toTelAddress } from "./phone.js";
export { bdappsConfig, type BdappsConfig } from "./config.js";
export { handleUssd, type UssdReply } from "./ussdMenu.js";
export type * from "./types.js";
