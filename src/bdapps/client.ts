import { bdappsConfig, type BdappsConfig } from "./config.js";
import { toTelAddress } from "./phone.js";
import type {
  BdappsResponse,
  SmsSendResponse,
  UssdSendResponse,
  QueryBalanceResponse,
  PaymentInstrumentListResponse,
  DirectDebitResponse,
  OtpRequestResponse,
  OtpVerifyResponse,
  SubscriptionStatusResponse,
  SubscriptionSendResponse,
} from "./types.js";

/** Thrown for network / parse / missing-credential problems (not for E-codes). */
export class BdappsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "BdappsError";
  }
}

/** True when a BDApps response indicates success. */
export function isSuccess(res: { statusCode?: string }): boolean {
  return res.statusCode === "S1000";
}

export interface SendSmsOptions {
  /** 0 = English, 16 = Bengali, 240 = Flash, 245 = Binary. Default: English. */
  encoding?: "0" | "16" | "240" | "245";
  /** Custom sender id (must be pre-approved in provisioning). */
  sourceAddress?: string;
  /** "1" to request a delivery report back to your listener. */
  deliveryStatusRequest?: "0" | "1";
  version?: string;
}

export interface DirectDebitParams {
  mobile: string;
  amount: number | string;
  /** Your own unique id for this charge. Auto-generated if omitted. */
  externalTrxId?: string;
  paymentInstrumentName?: string;
}

export interface SendUssdParams {
  sessionId: string;
  /** The user's (usually masked) address you're replying to. */
  destinationAddress: string;
  message: string;
  /** mt-cont keeps the menu open for a reply; mt-fin ends the session. */
  operation?: "mt-init" | "mt-cont" | "mt-fin";
  /** 440 = ASCII, 16 = Bengali. Default: 440. */
  encoding?: "440" | "16";
}

export interface OtpMeta {
  client?: "MOBILEAPP" | "WEBAPP";
  device?: string;
  os?: string;
  appCode?: string;
}

/**
 * A thin, typed wrapper over every BDApps API you need.
 * Usage:  import { bdapps } from "./bdapps/index.js";  await bdapps.sendSms(...)
 */
export class BdappsClient {
  constructor(private readonly cfg: BdappsConfig = bdappsConfig) {}

  // ---------------------------------------------------------------- core ----

  /** POST JSON to a BDApps endpoint and return the parsed response. */
  private async post<T extends BdappsResponse>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    if (!this.cfg.applicationId || !this.cfg.password) {
      throw new BdappsError(
        "Missing BDApps credentials. Set BDAPPS_APP_ID and BDAPPS_PASSWORD in backend/iut_ict_fest/.env",
        "E_CONFIG",
      );
    }
    const url = this.cfg.baseUrl + path;
    let text: string;
    let httpStatus: number;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      httpStatus = res.status;
      text = await res.text();
    } catch (err) {
      throw new BdappsError(
        `Network error calling ${path}: ${(err as Error).message}`,
        "E_NETWORK",
      );
    }
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BdappsError(
        `BDApps returned non-JSON (HTTP ${httpStatus}) from ${path}: ${text.slice(0, 200)}`,
        "E_PARSE",
        text,
      );
    }
  }

  /** Prefix a request body with the credentials every call needs. */
  private auth(body: Record<string, unknown>): Record<string, unknown> {
    return {
      applicationId: this.cfg.applicationId,
      password: this.cfg.password,
      ...body,
    };
  }

  // ----------------------------------------------------------------- SMS ----

  /** Send an SMS to one number, several numbers, or "tel:all" for everyone. */
  sendSms(
    to: string | string[],
    message: string,
    opts: SendSmsOptions = {},
  ): Promise<SmsSendResponse> {
    const addresses = (Array.isArray(to) ? to : [to]).map((a) =>
      a === "tel:all" ? a : toTelAddress(a),
    );
    return this.post<SmsSendResponse>(
      "/sms/send",
      this.auth({
        message,
        destinationAddresses: addresses,
        ...(opts.encoding ? { encoding: opts.encoding } : {}),
        ...(opts.sourceAddress ? { sourceAddress: opts.sourceAddress } : {}),
        ...(opts.deliveryStatusRequest
          ? { deliveryStatusRequest: opts.deliveryStatusRequest }
          : {}),
        ...(opts.version ? { version: opts.version } : {}),
      }),
    );
  }

  /** Broadcast an SMS to every subscriber of the app. */
  broadcastSms(message: string, opts: SendSmsOptions = {}): Promise<SmsSendResponse> {
    return this.sendSms("tel:all", message, opts);
  }

  // ---------------------------------------------------------------- USSD ----

  /** Push a USSD screen to the user during a session. */
  sendUssd(params: SendUssdParams): Promise<UssdSendResponse> {
    return this.post<UssdSendResponse>(
      "/ussd/send",
      this.auth({
        sessionId: params.sessionId,
        destinationAddress: params.destinationAddress.startsWith("tel:")
          ? params.destinationAddress
          : toTelAddress(params.destinationAddress),
        message: params.message,
        ussdOperation: params.operation ?? "mt-cont",
        encoding: params.encoding ?? "440",
      }),
    );
  }

  // ---------------------------------------------------------------- CAAS ----

  /** Read a subscriber's available mobile balance. */
  queryBalance(
    mobile: string,
    paymentInstrumentName = "Mobile Account",
  ): Promise<QueryBalanceResponse> {
    return this.post<QueryBalanceResponse>(
      "/caas/balance/query",
      this.auth({ subscriberId: toTelAddress(mobile), paymentInstrumentName }),
    );
  }

  /** List the ways a subscriber can pay. */
  listPaymentInstruments(
    mobile: string,
    type: "sync" | "async" | "all" = "all",
  ): Promise<PaymentInstrumentListResponse> {
    return this.post<PaymentInstrumentListResponse>(
      "/caas/list/pi",
      this.auth({ subscriberId: toTelAddress(mobile), type }),
    );
  }

  /** Charge an amount from a subscriber's balance. */
  directDebit(params: DirectDebitParams): Promise<DirectDebitResponse> {
    return this.post<DirectDebitResponse>(
      "/caas/direct/debit",
      this.auth({
        subscriberId: toTelAddress(params.mobile),
        amount: String(params.amount),
        externalTrxId: params.externalTrxId ?? `TRX-${Date.now()}`,
        paymentInstrumentName: params.paymentInstrumentName ?? "Mobile Account",
      }),
    );
  }

  // ----------------------------------------------------------------- OTP ----

  /** Send a one-time code by SMS. Returns a referenceNo for verifyOtp. */
  requestOtp(mobile: string, meta: OtpMeta = {}): Promise<OtpRequestResponse> {
    return this.post<OtpRequestResponse>(
      "/subscription/otp/request",
      this.auth({
        subscriberId: toTelAddress(mobile),
        applicationHash: this.cfg.appName,
        applicationMetaData: {
          client: meta.client ?? "WEBAPP",
          device: meta.device ?? "unknown",
          os: meta.os ?? "unknown",
          appCode: meta.appCode ?? "https://example.com",
        },
      }),
    );
  }

  /** Verify the code the user typed. On success returns a masked subscriberId. */
  verifyOtp(referenceNo: string, otp: string): Promise<OtpVerifyResponse> {
    return this.post<OtpVerifyResponse>(
      "/subscription/otp/verify",
      this.auth({ referenceNo, otp }),
    );
  }

  // -------------------------------------------------------- Subscription ----

  /** Check whether a user is subscribed (REGISTERED / UNREGISTERED). */
  getSubscriptionStatus(mobile: string): Promise<SubscriptionStatusResponse> {
    return this.post<SubscriptionStatusResponse>(
      "/subscription/getStatus",
      this.auth({ subscriberId: toTelAddress(mobile), version: "1.0" }),
    );
  }

  /** Subscribe a user (action 1). */
  subscribe(mobile: string): Promise<SubscriptionSendResponse> {
    return this.post<SubscriptionSendResponse>(
      "/subscription/send",
      this.auth({ subscriberId: toTelAddress(mobile), action: "1", version: "1.0" }),
    );
  }

  /** Unsubscribe a user (action 0). */
  unsubscribe(mobile: string): Promise<SubscriptionSendResponse> {
    return this.post<SubscriptionSendResponse>(
      "/subscription/send",
      this.auth({ subscriberId: toTelAddress(mobile), action: "0", version: "1.0" }),
    );
  }
}

/** Ready-to-use singleton configured from your .env. */
export const bdapps = new BdappsClient();
