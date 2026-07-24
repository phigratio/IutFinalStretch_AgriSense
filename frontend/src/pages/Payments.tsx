import { FormEvent, useState } from "react";
import type { ReactNode } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { checkoutPayment, getPayment, type CheckoutResult, type PaymentRecord } from "../api/payments.js";
import { CreditCardIcon, SearchIcon } from "../icons/index.js";

export default function Payments() {
  const [mobile, setMobile] = useState("01812345678");
  const [amountBdt, setAmountBdt] = useState("25");
  const [description, setDescription] = useState("AgriSense order");
  const [sessionId, setSessionId] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [checkout, setCheckout] = useState<CheckoutResult | null>(null);
  const [receipt, setReceipt] = useState<PaymentRecord | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submitCheckout(event: FormEvent) {
    event.preventDefault();
    setLoading("checkout");
    setError(null);
    try {
      const result = await checkoutPayment({
        mobile,
        amountBdt: Number(amountBdt),
        description,
        sessionId: sessionId || undefined,
      });
      setCheckout(result);
      setLookupId(result.paymentId);
      setReceipt(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(null);
    }
  }

  async function lookupReceipt(event: FormEvent) {
    event.preventDefault();
    if (!lookupId.trim()) return;
    setLoading("lookup");
    setError(null);
    try {
      setReceipt(await getPayment(lookupId.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt lookup failed");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <PageMeta title="BDApps Payments · ICT Fest Admin" description="BDApps CaaS checkout, balance deduction, and receipt flow" />
      <PageBreadcrumb pageTitle="BDApps Payments" />

      {error && <Alert tone="error">{error}</Alert>}

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">BDApps CaaS Checkout</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Demonstrates payment instruments, operator balance query, direct debit, balance deduction, receipt persistence, and SMS receipt evidence.
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
            Tier 2 payment gateway
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <FlowStep index="1" title="Payment instruments" detail="Check available mobile account rails." />
          <FlowStep index="2" title="Balance before" detail="Read operator balance before debit." />
          <FlowStep index="3" title="Direct debit" detail="Charge the sandbox subscriber." />
          <FlowStep index="4" title="Receipt + SMS" detail="Persist receipt and send confirmation." />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <CreditCardIcon />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Checkout</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Runs the same CaaS payment flow used by the backend.</p>
            </div>
          </div>

          <form onSubmit={submitCheckout} className="space-y-4">
            <Field label="Mobile">
              <input value={mobile} onChange={(e) => setMobile(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Amount BDT">
              <input value={amountBdt} onChange={(e) => setAmountBdt(e.target.value)} inputMode="decimal" className={inputClass} />
            </Field>
            <Field label="Description">
              <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
            </Field>
            <Field label="Session ID">
              <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} placeholder="Optional trace link" className={inputClass} />
            </Field>
            <button disabled={loading === "checkout"} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              <CreditCardIcon width={18} height={18} />
              Run checkout
            </button>
          </form>
        </section>

        <section className="space-y-4">
          {checkout && <CheckoutSummary checkout={checkout} />}
          <form onSubmit={lookupReceipt} className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Receipt Lookup</h2>
            <div className="flex gap-2">
              <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Payment ID" className={inputClass} />
              <button aria-label="Lookup receipt" disabled={loading === "lookup"} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 dark:bg-white dark:text-gray-900">
                <SearchIcon width={18} height={18} />
              </button>
            </div>
          </form>

          {checkout && <Result title="Raw Checkout Result" value={checkout} />}
          {receipt && <Result title="Receipt" value={receipt} />}
        </section>
      </div>
    </>
  );
}

const inputClass =
  "h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

function Alert({ children }: { children: ReactNode; tone: "error" }) {
  return <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{children}</div>;
}

function FlowStep({ index, title, detail }: { index: string; title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">{index}</span>
        <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function CheckoutSummary({ checkout }: { checkout: CheckoutResult }) {
  const balanceAfter = checkout.balanceBeforeBdt != null ? checkout.balanceBeforeBdt - checkout.amountBdt : undefined;
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Checkout Evidence</h2>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${checkout.ok ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-400" : "bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-400"}`}>
          {checkout.status}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SummaryMetric label="Charged" value={`৳${checkout.amountBdt}`} />
        <SummaryMetric label="Balance before" value={checkout.balanceBeforeBdt != null ? `৳${checkout.balanceBeforeBdt}` : "n/a"} />
        <SummaryMetric label="Balance after" value={balanceAfter != null ? `৳${balanceAfter}` : "n/a"} />
        <SummaryMetric label="SMS receipt" value={checkout.smsSent ? "sent" : "not sent"} />
      </div>
      <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
        Payment ID {checkout.paymentId}. Transaction {checkout.internalTrxId ?? checkout.externalTrxId ?? "pending"}.
      </p>
    </section>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function Result({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-3 text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      <pre className="custom-scrollbar max-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}
