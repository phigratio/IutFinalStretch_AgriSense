/**
 * Offline mock of the BDApps client — same public surface, canned responses
 * shaped like the official cheatsheet examples, every payload tagged `mock: true`.
 *
 * Consumed by: src/bdapps/index.ts, which exports this instead of the real
 * client when MOCK_BDAPPS=1. Lets the payment/checkout feature (P-1) and the
 * CLI run with no credentials / no internet. The demo runs against the REAL
 * sandbox — mock mode is for development only and is declared in the README.
 *
 * Stateful bits: per-number balance (seed via MOCK_BDAPPS_BALANCE, default 100 BDT)
 * so the insufficient-balance branch (E1326) is exercisable; OTP referenceNo map
 * (any requested OTP verifies with 123456).
 */
import { toTelAddress } from "./phone.js";
import type {
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
import type {
  SendSmsOptions,
  SendUssdParams,
  DirectDebitParams,
  OtpMeta,
} from "./client.js";

const OK = { statusDetail: "Request was successfully processed", version: "1.0" };
const MOCK_OTP = "123456";

function log(what: string, detail: string): void {
  console.log(`[bdapps:mock] ${what} — ${detail}`);
}

export class MockBdappsClient {
  /** Marker so tests/routes can tell mock from real at runtime. */
  readonly isMock = true as const;

  private balances = new Map<string, number>();
  private otpRefs = new Map<string, string>(); // referenceNo -> tel address
  private subscribed = new Set<string>();
  private seq = 0;

  private balanceOf(tel: string): number {
    if (!this.balances.has(tel)) {
      this.balances.set(tel, Number(process.env.MOCK_BDAPPS_BALANCE ?? "100"));
    }
    return this.balances.get(tel)!;
  }

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${Date.now()}-${this.seq}`;
  }

  // ----------------------------------------------------------------- SMS ----

  async sendSms(
    to: string | string[],
    message: string,
    _opts: SendSmsOptions = {},
  ): Promise<SmsSendResponse & { mock: true }> {
    const addresses = (Array.isArray(to) ? to : [to]).map((a) =>
      a === "tel:all" ? a : toTelAddress(a),
    );
    log("SMS", `to ${addresses.join(", ")}: "${message}"`);
    return {
      statusCode: "S1000",
      ...OK,
      requestId: this.nextId("MOCKSMS"),
      destinationResponses: addresses.map((address) => ({
        statusCode: "S1000",
        address,
        messageId: this.nextId("MOCKMSG"),
      })),
      mock: true,
    };
  }

  async broadcastSms(
    message: string,
    opts: SendSmsOptions = {},
  ): Promise<SmsSendResponse & { mock: true }> {
    return this.sendSms("tel:all", message, opts);
  }

  // ---------------------------------------------------------------- USSD ----

  async sendUssd(params: SendUssdParams): Promise<UssdSendResponse & { mock: true }> {
    log("USSD", `${params.operation ?? "mt-cont"} to ${params.destinationAddress}: "${params.message}"`);
    return { statusCode: "S1000", ...OK, requestId: this.nextId("MOCKUSSD"), mock: true };
  }

  // ---------------------------------------------------------------- CAAS ----

  async queryBalance(
    mobile: string,
    _paymentInstrumentName = "Mobile Account",
  ): Promise<QueryBalanceResponse & { mock: true }> {
    const tel = toTelAddress(mobile);
    return {
      statusCode: "S1000",
      ...OK,
      chargeableBalance: this.balanceOf(tel).toFixed(2),
      accountType: "PREPAID",
      accountStatus: "0",
      mock: true,
    };
  }

  async listPaymentInstruments(
    _mobile: string,
    _type: "sync" | "async" | "all" = "all",
  ): Promise<PaymentInstrumentListResponse & { mock: true }> {
    return {
      statusCode: "S1000",
      ...OK,
      paymentInstrumentList: [{ name: "Mobile Account", type: "sync" }],
      mock: true,
    };
  }

  async directDebit(params: DirectDebitParams): Promise<DirectDebitResponse & { mock: true }> {
    const tel = toTelAddress(params.mobile);
    const amount = Number(params.amount);
    const balance = this.balanceOf(tel);
    const externalTrxId = params.externalTrxId ?? `TRX-${Date.now()}`;

    if (!Number.isFinite(amount) || amount <= 0) {
      return { statusCode: "E1312", statusDetail: "Invalid amount", externalTrxId, mock: true };
    }
    if (amount > balance) {
      log("DEBIT REFUSED", `${tel} balance ${balance} < amount ${amount} (E1326)`);
      return {
        statusCode: "E1326",
        statusDetail: "Insufficient balance",
        externalTrxId,
        mock: true,
      };
    }

    this.balances.set(tel, balance - amount);
    log("DEBIT", `${tel} charged ${amount} BDT, balance now ${balance - amount}`);
    return {
      statusCode: "S1000",
      ...OK,
      externalTrxId,
      internalTrxId: this.nextId("MOCKTRX"),
      timeStamp: new Date().toISOString(),
      mock: true,
    };
  }

  // ----------------------------------------------------------------- OTP ----

  async requestOtp(mobile: string, _meta: OtpMeta = {}): Promise<OtpRequestResponse & { mock: true }> {
    const tel = toTelAddress(mobile);
    const referenceNo = this.nextId("MOCKREF");
    this.otpRefs.set(referenceNo, tel);
    log("OTP", `code ${MOCK_OTP} "sent" to ${tel} (referenceNo ${referenceNo})`);
    return { statusCode: "S1000", ...OK, referenceNo, mock: true };
  }

  async verifyOtp(referenceNo: string, otp: string): Promise<OtpVerifyResponse & { mock: true }> {
    const tel = this.otpRefs.get(referenceNo);
    if (!tel) {
      return { statusCode: "E1851", statusDetail: "OTP expired or unknown reference", mock: true };
    }
    if (otp !== MOCK_OTP) {
      return { statusCode: "E1850", statusDetail: "Invalid OTP", mock: true };
    }
    this.otpRefs.delete(referenceNo);
    return {
      statusCode: "S1000",
      ...OK,
      subscriptionStatus: this.subscribed.has(tel) ? "REGISTERED" : "UNREGISTERED",
      subscriberId: `tel:masked_${tel.slice(-6)}`,
      mock: true,
    };
  }

  // -------------------------------------------------------- Subscription ----

  async getSubscriptionStatus(mobile: string): Promise<SubscriptionStatusResponse & { mock: true }> {
    const tel = toTelAddress(mobile);
    return {
      statusCode: "S1000",
      ...OK,
      subscriptionStatus: this.subscribed.has(tel) ? "REGISTERED" : "UNREGISTERED",
      mock: true,
    };
  }

  async subscribe(mobile: string): Promise<SubscriptionSendResponse & { mock: true }> {
    this.subscribed.add(toTelAddress(mobile));
    return { statusCode: "S1000", ...OK, subscriptionStatus: "REGISTERED", mock: true };
  }

  async unsubscribe(mobile: string): Promise<SubscriptionSendResponse & { mock: true }> {
    this.subscribed.delete(toTelAddress(mobile));
    return { statusCode: "S1000", ...OK, subscriptionStatus: "UNREGISTERED", mock: true };
  }
}

export const mockBdapps = new MockBdappsClient();
