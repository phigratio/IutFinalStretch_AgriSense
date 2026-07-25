import { FormEvent, useState } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import * as bdapps from "../api/bdapps.js";
import { PhoneIcon } from "../icons/index.js";

type Action =
  | "sms"
  | "broadcast"
  | "otp-request"
  | "otp-verify"
  | "balance"
  | "pi"
  | "charge"
  | "subscription-status"
  | "subscribe"
  | "unsubscribe";

const actions: { value: Action; label: string }[] = [
  { value: "sms", label: "Send SMS" },
  { value: "broadcast", label: "Broadcast" },
  { value: "otp-request", label: "Request OTP" },
  { value: "otp-verify", label: "Verify OTP" },
  { value: "balance", label: "Balance" },
  { value: "pi", label: "Payment Instruments" },
  { value: "charge", label: "Direct Charge" },
  { value: "subscription-status", label: "Subscription Status" },
  { value: "subscribe", label: "Subscribe" },
  { value: "unsubscribe", label: "Unsubscribe" },
];

export default function Bdapps() {
  const [action, setAction] = useState<Action>("balance");
  const [mobile, setMobile] = useState("01812345678");
  const [message, setMessage] = useState("AgriSense test message");
  const [amount, setAmount] = useState("2");
  const [referenceNo, setReferenceNo] = useState("");
  const [otp, setOtp] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await runAction(action, { mobile, message, amount: Number(amount), referenceNo, otp });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "BDApps request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageMeta title="BDApps · AgriSense Admin" description="BDApps SMS, USSD, OTP, subscription, and listener console" />
      <PageBreadcrumb pageTitle="BDApps" />

      {error && <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>}

      <section className="mb-4 rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">BDApps Channel Console</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500 dark:text-gray-400">
              Verify the official TAP surfaces used by the demo: SMS, USSD, OTP, subscription capture, subscriber status, and CaaS support.
            </p>
          </div>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">SMS + USSD + OTP</span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ListenerCard title="SMS listener" path="/bdapps/sms" detail="Inbound farmer commands and weather replies." />
          <ListenerCard title="USSD listener" path="/bdapps/ussd" detail="Menu access for plan, weather, and alerts." />
          <ListenerCard title="Subscription listener" path="/bdapps/subscription" detail="Captures masked subscriber IDs for alerts." />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-500 dark:bg-brand-500/15">
              <PhoneIcon />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Action Console</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Calls the `/api/bdapps` test routes.</p>
            </div>
          </div>

          <form onSubmit={run} className="space-y-4">
            <label className="block">
              <span className={labelClass}>Action</span>
              <select value={action} onChange={(e) => setAction(e.target.value as Action)} className={inputClass}>
                {actions.map((item) => (
                  <option
                    key={item.value}
                    value={item.value}
                    className="bg-white text-gray-800 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {action !== "broadcast" && <TextField label="Mobile" value={mobile} onChange={setMobile} />}
            {(action === "sms" || action === "broadcast") && <TextField label="Message" value={message} onChange={setMessage} />}
            {action === "charge" && <TextField label="Amount" value={amount} onChange={setAmount} />}
            {action === "otp-verify" && (
              <>
                <TextField label="Reference No" value={referenceNo} onChange={setReferenceNo} />
                <TextField label="OTP" value={otp} onChange={setOtp} />
              </>
            )}
            <button disabled={loading} className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              <PhoneIcon width={18} height={18} />
              Run action
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Raw TAP Response</h2>
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
              {action}
            </span>
          </div>
          <pre className="custom-scrollbar min-h-[420px] overflow-auto rounded-lg bg-gray-950 p-4 text-xs leading-5 text-gray-100">
            {result ? JSON.stringify(result, null, 2) : "No response yet."}
          </pre>
        </section>
      </div>
    </>
  );
}

const inputClass = "h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";
const labelClass = "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

function ListenerCard({ title, path, detail }: { title: string; path: string; detail: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
      <p className="text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 font-mono text-xs text-brand-600 dark:text-brand-300">{path}</p>
      <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">{detail}</p>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

function runAction(action: Action, input: { mobile: string; message: string; amount: number; referenceNo: string; otp: string }) {
  switch (action) {
    case "sms":
      return bdapps.sendSms({ to: input.mobile, message: input.message });
    case "broadcast":
      return bdapps.broadcastSms(input.message);
    case "otp-request":
      return bdapps.requestOtp(input.mobile);
    case "otp-verify":
      return bdapps.verifyOtp({ referenceNo: input.referenceNo, otp: input.otp });
    case "balance":
      return bdapps.queryBalance(input.mobile);
    case "pi":
      return bdapps.listPaymentInstruments(input.mobile);
    case "charge":
      return bdapps.charge({ mobile: input.mobile, amount: input.amount });
    case "subscription-status":
      return bdapps.subscriptionStatus(input.mobile);
    case "subscribe":
      return bdapps.subscribe(input.mobile);
    case "unsubscribe":
      return bdapps.unsubscribe(input.mobile);
  }
}
