/**
 * BDApps opt-in card for the farmer onboarding page (web). Lets a logged-in
 * farmer connect BDApps via a feature popup -> consent -> OTP -> verify, so
 * AgriSense can send SMS alerts and later charge orders to their mobile balance.
 * Reuses the existing channel-activation endpoints (api/channel.ts): the masked
 * subscriberId persisted by /auth/bdapps/verify-phone IS the BDApps credential
 * the payment flow reads — no new DB column. Rendered by pages/Onboarding.tsx.
 */
import { useEffect, useState } from "react";
import { requestBdappsOtp, verifyPhone, getChannelStatus } from "../../api/channel.js";
import { ApiError } from "../../api/client.js";

type Step = "consent" | "otp" | "done";

const FEATURES: Array<{ icon: string; title: string; desc: string }> = [
  {
    icon: "🔔",
    title: "আবহাওয়া ও রোগ-পোকার SMS সতর্কতা",
    desc: "ইন্টারনেট ছাড়াই সময়মতো পরামর্শ সরাসরি মোবাইলে পৌঁছে যাবে।",
  },
  {
    icon: "💳",
    title: "মোবাইল ব্যালেন্স দিয়ে পেমেন্ট",
    desc: "সার, বীজ বা মার্কেট অর্ডারের দাম সরাসরি মোবাইল ব্যালেন্স থেকে দিন।",
  },
  {
    icon: "🧾",
    title: "পেমেন্ট রসিদ SMS",
    desc: "প্রতিটি লেনদেনের নিশ্চিতকরণ রসিদ SMS-এ পেয়ে যাবেন।",
  },
];

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

/** Basic BD-mobile sanity check so we don't fire an OTP request for junk. */
function looksLikeMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 11 && digits.includes("01");
}

export default function BdappsOptInCard({ phone }: { phone?: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("consent");
  const [consent, setConsent] = useState(false);
  const [mobile, setMobile] = useState(phone ?? "");
  const [referenceNo, setReferenceNo] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // active === false after a successful verify means the phone is verified but
  // the masked subscriberId hasn't arrived yet — activation completes later via
  // the subscription-confirmation webhook (see channel.ts capture points).
  const [active, setActive] = useState(false);

  useEffect(() => {
    setMobile(phone ?? "");
  }, [phone]);

  // Reflect an already-connected channel so we don't re-prompt.
  useEffect(() => {
    if (!phone) return;
    getChannelStatus(phone)
      .then((s) => setActive(Boolean(s.active)))
      .catch(() => undefined);
  }, [phone]);

  async function sendOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await requestBdappsOtp(mobile.trim());
      setReferenceNo(res.referenceNo);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "OTP পাঠানো যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOtp() {
    setBusy(true);
    setError(null);
    try {
      const res = await verifyPhone({ referenceNo, otp: otp.trim(), mobile: mobile.trim() });
      setActive(res.channelActive);
      setStep("done");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "কোড যাচাই করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  function close() {
    setOpen(false);
    setError(null);
    // Keep a completed connection sticky; only reset the in-progress flow.
    if (step !== "done") {
      setStep("consent");
      setConsent(false);
      setOtp("");
    }
  }

  return (
    <>
      <div className="mt-6 rounded-2xl border border-brand-200 bg-brand-50/60 p-5 dark:border-brand-800 dark:bg-brand-500/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-gray-800 dark:text-white/90">📱 BDApps যুক্ত করুন</div>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
              SMS সতর্কতা পান এবং মোবাইল ব্যালেন্স দিয়ে পেমেন্ট করুন।
            </p>
          </div>
          {active ? (
            <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              ✅ যুক্ত আছে
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              বিস্তারিত ও চালু করুন
            </button>
          )}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-gray-900/55 px-4 py-6"
          style={{ fontFamily: "'Noto Sans Bengali', 'Hind Siliguri', system-ui, sans-serif" }}
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-2xl bg-white shadow-xl dark:bg-gray-950">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">📱 BDApps ইন্টিগ্রেশন</h2>
              <button
                type="button"
                onClick={close}
                aria-label="বন্ধ করুন"
                className="text-xl leading-none text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4">
              {step === "consent" && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    BDApps যুক্ত করলে আপনি নিচের সুবিধাগুলো পাবেন:
                  </p>
                  <ul className="mt-3 space-y-3">
                    {FEATURES.map((f) => (
                      <li key={f.title} className="flex gap-3">
                        <span className="text-lg leading-6">{f.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-gray-800 dark:text-white/90">{f.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{f.desc}</div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <label className="mt-2 block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">মোবাইল নম্বর</span>
                    <input
                      type="tel"
                      className={inputCls}
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="017XXXXXXXX"
                    />
                  </label>

                  <label className="mt-4 flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      আমি BDApps ইন্টিগ্রেশন চালু করতে এবং SMS/পেমেন্টের জন্য আমার নম্বর ব্যবহারে সম্মত।
                    </span>
                  </label>

                  <button
                    type="button"
                    disabled={busy || !consent || !looksLikeMobile(mobile)}
                    onClick={sendOtp}
                    className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {busy ? "OTP পাঠানো হচ্ছে…" : "OTP পাঠান"}
                  </button>
                </>
              )}

              {step === "otp" && (
                <>
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-gray-800 dark:text-white/90">{mobile}</span> নম্বরে পাঠানো কোডটি লিখুন।
                  </p>
                  <label className="mt-3 block">
                    <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">যাচাই কোড (OTP)</span>
                    <input
                      inputMode="numeric"
                      className={inputCls}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      placeholder="৬-সংখ্যার কোড"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busy || otp.trim().length < 4}
                    onClick={confirmOtp}
                    className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    {busy ? "যাচাই করা হচ্ছে…" : "যাচাই করুন ও চালু করুন"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={sendOtp}
                    className="mt-2 w-full text-center text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
                  >
                    কোড পাননি? আবার পাঠান
                  </button>
                </>
              )}

              {step === "done" && (
                <div className="py-2 text-center">
                  {active ? (
                    <>
                      <div className="text-3xl">✅</div>
                      <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">BDApps যুক্ত হয়েছে!</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        এখন আপনি SMS সতর্কতা পাবেন এবং মোবাইল ব্যালেন্স দিয়ে পেমেন্ট করতে পারবেন।
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="text-3xl">📨</div>
                      <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-white/90">আপনার নম্বর যাচাই হয়েছে।</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        একটি নিশ্চিতকরণ SMS পাওয়ার পর BDApps সংযোগ সম্পূর্ণ হবে।
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="mt-4 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    ঠিক আছে
                  </button>
                </div>
              )}

              {error && (
                <p className="mt-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                  ⚠️ {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
