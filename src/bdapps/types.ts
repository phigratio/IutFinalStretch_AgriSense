/**
 * Type definitions for BDApps requests and responses.
 * Every response includes at least `statusCode` — "S1000" means success.
 */

export interface BdappsResponse {
  statusCode: string;
  statusDetail?: string;
  version?: string;
}

export interface SmsDestinationResponse {
  statusCode: string;
  address?: string;
  messageId?: string;
  timeStamp?: string;
  statusDetail?: string;
}

export interface SmsSendResponse extends BdappsResponse {
  requestId?: string;
  destinationResponses?: SmsDestinationResponse[];
}

export interface UssdSendResponse extends BdappsResponse {
  requestId?: string;
}

export interface QueryBalanceResponse extends BdappsResponse {
  /** Available balance, rounded to 2 decimals, as a string. */
  chargeableBalance?: string;
  /** e.g. "PREPAID" / "POSTPAID". */
  accountType?: string;
  accountStatus?: string;
}

export interface PaymentInstrument {
  name: string;
  /** "sync" | "async". */
  type: string;
}

export interface PaymentInstrumentListResponse extends BdappsResponse {
  paymentInstrumentList?: PaymentInstrument[];
}

export interface DirectDebitResponse extends BdappsResponse {
  /** Your own id, echoed back so you can reconcile the charge. */
  externalTrxId?: string;
  /** BDApps' internal transaction id. */
  internalTrxId?: string;
  referenceId?: string;
  timeStamp?: string;
}

export interface OtpRequestResponse extends BdappsResponse {
  /** Keep this — you pass it back to verifyOtp. */
  referenceNo?: string;
}

export interface OtpVerifyResponse extends BdappsResponse {
  subscriptionStatus?: "REGISTERED" | "UNREGISTERED" | string;
  /** Masked subscriber id — store this as the user's id for future calls. */
  subscriberId?: string;
}

export interface SubscriptionStatusResponse extends BdappsResponse {
  subscriptionStatus?: "REGISTERED" | "UNREGISTERED" | string;
}

export interface SubscriptionSendResponse extends BdappsResponse {
  subscriptionStatus?: string;
}

/**
 * USSD operations.
 *  - mt-* are sent BY your app (mt-cont = keep session open, mt-fin = end).
 *  - mo-* are received FROM the user (mo-init = they dialled in, mo-cont = they replied).
 */
export type UssdOperation = "mt-init" | "mt-cont" | "mt-fin" | "mo-init" | "mo-cont";

/** JSON that BDApps POSTs to your USSD listener. */
export interface IncomingUssd {
  message: string;
  sessionId: string;
  /** Usually a MASKED id — reply/charge using this exact value. */
  sourceAddress: string;
  ussdOperation: UssdOperation;
  applicationId?: string;
  requestId?: string;
  encoding?: string;
  version?: string;
}

/** JSON that BDApps POSTs to your SMS listener. */
export interface IncomingSms {
  message: string;
  /** Usually a MASKED id — reply using this exact value. */
  sourceAddress: string;
  applicationId?: string;
  requestId?: string;
  encoding?: string;
  version?: string;
}

/** JSON that BDApps POSTs to your subscription-notification listener. */
export interface IncomingSubscriptionNotification {
  /** "REGISTERED" | "UNREGISTERED". */
  status: string;
  subscriberId: string;
  applicationId?: string;
  timeStamp?: string;
  frequency?: string;
}
