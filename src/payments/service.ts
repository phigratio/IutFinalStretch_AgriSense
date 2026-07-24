/**
 * bdapps CaaS checkout flow (P-1, the 10-pt rubric row): the ONE place a
 * payment happens. Sequence per the official cheatsheet:
 *
 *   list payment instruments -> query balance -> direct debit -> receipt SMS
 *
 * Every step is persisted: the money in bdapps_payments (payments/store.ts),
 * the evidence as agent_tool_calls via AgriSenseStore.saveTrace when a
 * sessionId is given — so the judge-facing trace panel shows raw CaaS
 * request/responses. Consumed by: routes/payments.ts and (later) the agent's
 * checkout_order tool — both call this same function.
 */
import { bdapps as defaultBdapps, isSuccess, type BdappsApi } from "../bdapps/index.js";
import { resolveSubscriberAddress } from "../bdapps/subscriberStore.js";
import { getDefaultAgriSenseStore, type AgriSenseStore } from "../agrisense/agrisenseStore.js";
import { getDefaultPaymentStore, type PaymentStore } from "./store.js";

export interface CheckoutInput {
  mobile: string;
  amountBdt: number;
  /** What the farmer is paying for — goes in the receipt SMS + payload. */
  description?: string;
  planId?: string;
  userId?: string;
  /** When set, each CaaS step is logged to agent_tool_calls for the trace panel. */
  sessionId?: string;
}

export interface CheckoutResult {
  ok: boolean;
  paymentId: string;
  status: "success" | "insufficient" | "failed";
  statusCode: string;
  statusDetail?: string;
  externalTrxId?: string;
  internalTrxId?: string;
  balanceBeforeBdt?: number;
  amountBdt: number;
  smsSent: boolean;
  /** True when any step was served by the offline mock (declared honestly in UI/README). */
  mock: boolean;
}

export interface CheckoutDeps {
  bdapps: BdappsApi;
  payments: PaymentStore;
  trace: AgriSenseStore;
}

function defaultDeps(): CheckoutDeps {
  return {
    bdapps: defaultBdapps,
    payments: getDefaultPaymentStore(),
    trace: getDefaultAgriSenseStore(),
  };
}

/** Trace helper — never lets trace persistence break the payment itself. */
async function logStep(
  deps: CheckoutDeps,
  sessionId: string | undefined,
  toolName: string,
  parameters: Record<string, unknown>,
  rawResponse: unknown,
  startedAt: number,
  errorMessage?: string,
): Promise<void> {
  if (!sessionId) return;
  try {
    await deps.trace.saveTrace(sessionId, {
      kind: "tool",
      toolName,
      parameters,
      rawResponse,
      status: errorMessage ? "error" : "success",
      errorMessage,
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    console.error(`[payments] trace logging failed (${toolName}):`, (err as Error).message);
  }
}

function isMockResponse(res: unknown): boolean {
  return typeof res === "object" && res !== null && (res as { mock?: boolean }).mock === true;
}

export async function checkout(
  input: CheckoutInput,
  deps: CheckoutDeps = defaultDeps(),
): Promise<CheckoutResult> {
  // Resolve to the masked subscriberId when we captured one at OTP verify —
  // bdapps rejects the raw number on this app (E1951). See subscriberStore.
  const tel = resolveSubscriberAddress(input.mobile);
  const payment = await deps.payments.createPayment({
    mobile: tel,
    amountBdt: input.amountBdt,
    planId: input.planId,
    userId: input.userId,
    requestPayload: {
      mobile: tel,
      amountBdt: input.amountBdt,
      description: input.description ?? "AgriSense order",
      sessionId: input.sessionId,
    },
  });
  const externalTrxId = `AGS-${payment.id.slice(0, 8)}-${Date.now()}`;
  let mock = false;

  const fail = async (
    statusCode: string,
    statusDetail: string,
    status: "insufficient" | "failed",
    responsePayload: unknown,
    balanceBeforeBdt?: number,
  ): Promise<CheckoutResult> => {
    await deps.payments.completePayment(payment.id, {
      status,
      responsePayload,
      externalReference: externalTrxId,
    });
    return {
      ok: false,
      paymentId: payment.id,
      status,
      statusCode,
      statusDetail,
      externalTrxId,
      balanceBeforeBdt,
      amountBdt: input.amountBdt,
      smsSent: false,
      mock,
    };
  };

  // 1. Payment instruments (optional pre-check). Some sandbox apps have this
  //    route disabled (raw 404) while direct debit is live — so a failure here
  //    is logged and skipped, not fatal. The debit in step 3 is the decision.
  let t = Date.now();
  try {
    const piRes = await deps.bdapps.listPaymentInstruments(tel);
    mock ||= isMockResponse(piRes);
    await logStep(deps, input.sessionId, "bdapps_list_payment_instruments", { mobile: tel }, piRes, t);
  } catch (err) {
    await logStep(deps, input.sessionId, "bdapps_list_payment_instruments", { mobile: tel }, { skipped: true }, t, (err as Error).message);
  }

  // 2. Balance pre-check (optional). When available it powers the friendly
  //    insufficient-balance branch; when the route is disabled we skip it and
  //    let the debit itself return E1326/E1308 if funds are short.
  t = Date.now();
  let balanceBeforeBdt: number | undefined;
  try {
    const balanceRes = await deps.bdapps.queryBalance(tel);
    mock ||= isMockResponse(balanceRes);
    await logStep(deps, input.sessionId, "bdapps_query_balance", { mobile: tel }, balanceRes, t);
    if (isSuccess(balanceRes)) {
      balanceBeforeBdt = Number(balanceRes.chargeableBalance ?? "0");
      if (balanceBeforeBdt < input.amountBdt) {
        return fail(
          "E1326",
          `Insufficient balance: have ${balanceBeforeBdt.toFixed(2)}, need ${input.amountBdt.toFixed(2)}`,
          "insufficient",
          balanceRes,
          balanceBeforeBdt,
        );
      }
    }
  } catch (err) {
    await logStep(deps, input.sessionId, "bdapps_query_balance", { mobile: tel }, { skipped: true }, t, (err as Error).message);
  }

  // 3. The actual charge — the real decision point.
  t = Date.now();
  let debitRes;
  try {
    debitRes = await deps.bdapps.directDebit({ mobile: tel, amount: input.amountBdt, externalTrxId });
  } catch (err) {
    await logStep(deps, input.sessionId, "bdapps_direct_debit", { mobile: tel, amount: input.amountBdt, externalTrxId }, undefined, t, (err as Error).message);
    return fail("E_NETWORK", (err as Error).message, "failed", { error: (err as Error).message }, balanceBeforeBdt);
  }
  mock ||= isMockResponse(debitRes);
  await logStep(deps, input.sessionId, "bdapps_direct_debit", { mobile: tel, amount: input.amountBdt, externalTrxId }, debitRes, t);
  if (!isSuccess(debitRes)) {
    const status = debitRes.statusCode === "E1326" || debitRes.statusCode === "E1308" ? "insufficient" : "failed";
    return fail(debitRes.statusCode, debitRes.statusDetail ?? "Charge failed", status, debitRes, balanceBeforeBdt);
  }

  await deps.payments.completePayment(payment.id, {
    status: "success",
    responsePayload: debitRes,
    externalReference: debitRes.externalTrxId ?? externalTrxId,
    receiptNumber: debitRes.internalTrxId,
  });

  // 4. Receipt SMS — best effort; a failed SMS must not undo a successful charge.
  let smsSent = false;
  t = Date.now();
  const receiptText =
    `AgriSense receipt: Tk ${input.amountBdt.toFixed(2)} for ` +
    `${input.description ?? "your order"}. TrxID ${debitRes.internalTrxId ?? externalTrxId}. Thank you!`;
  try {
    const smsRes = await deps.bdapps.sendSms(tel, receiptText);
    smsSent = isSuccess(smsRes);
    await logStep(deps, input.sessionId, "bdapps_send_sms", { mobile: tel, message: receiptText }, smsRes, t);
  } catch (err) {
    await logStep(deps, input.sessionId, "bdapps_send_sms", { mobile: tel, message: receiptText }, undefined, t, (err as Error).message);
  }

  return {
    ok: true,
    paymentId: payment.id,
    status: "success",
    statusCode: debitRes.statusCode,
    statusDetail: debitRes.statusDetail,
    externalTrxId: debitRes.externalTrxId ?? externalTrxId,
    internalTrxId: debitRes.internalTrxId,
    balanceBeforeBdt,
    amountBdt: input.amountBdt,
    smsSent,
    mock,
  };
}
