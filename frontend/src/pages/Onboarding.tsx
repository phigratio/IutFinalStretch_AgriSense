import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  getOnboardingMe,
  requestTenant,
  requestAssist,
  type UserRole,
  type OnboardingMe,
} from "../api/onboarding.js";
import LocationAutofill, { EditableDistrictSelect } from "../components/onboarding/LocationAutofill.js";
import SelfOnboardChat from "../components/onboarding/SelfOnboardChat.js";
import BdappsOptInCard from "../components/onboarding/BdappsOptInCard.js";


const ROLE_BN: Record<UserRole, string> = { user: "ব্যবহারকারী", tenant: "টেন্যান্ট", admin: "অ্যাডমিন" };
const FIELD_BN: Record<OnboardingMe["missingFields"][number], string> = {
  fullName: "পূর্ণ নাম", phone: "মোবাইল নম্বর", district: "জেলা", farmSizeDecimals: "জমির পরিমাণ",
  soilTexture: "মাটির ধরন", waterAvailability: "সেচ সুবিধা", budgetBdt: "বাজেট", targetSeason: "মৌসুম",
};

type Choice = "tenant" | "self" | "assist";

export default function Onboarding() {
  const { user, refreshUser, logout } = useAuth();
  const location = useLocation();
  const [role, setRole] = useState<UserRole>("user");
  const [hasProfile, setHasProfile] = useState(false);
  const [status, setStatus] = useState<OnboardingMe | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOnboardingMe()
      .then((me) => {
        setStatus(me);
        setRole(me.role);
        setHasProfile(Boolean(me.onboarding));
        if (me.onboarding && !me.profileComplete) setChoice("self");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status?.role === "tenant" && user?.role !== "tenant") void refreshUser();
  }, [refreshUser, status?.role, user?.role]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      const next = await getOnboardingMe();
      setStatus(next);
      setRole(next.role);
      setHasProfile(Boolean(next.onboarding));
      setMessage(ok);
      setChoice(null);
    } catch (e) {
      setError((e as Error).message || "একটি সমস্যা হয়েছে");
    } finally {
      setBusy(false);
    }
  }

  // Admins belong on the dashboard, not the farmer onboarding.
  if (user?.role === "admin") return <Navigate to="/" replace />;
  if (status?.role === "tenant") {
    return user?.role === "tenant" ? <Navigate to="/tenant/dashboard" replace /> : null;
  }
  if (status?.profileComplete && new URLSearchParams(location.search).get("edit") !== "1") return <Navigate to="/user/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950" style={{ fontFamily: "'Noto Sans Bengali', 'Hind Siliguri', system-ui, sans-serif" }}>
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
        <span className="text-lg font-bold text-brand-500">🌾 AgriSense</span>
        <div className="flex items-center gap-3 text-sm">
          {user && <span className="text-gray-500 dark:text-gray-400">{user.name}</span>}
          <button onClick={logout} className="rounded-lg border border-gray-300 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            লগ আউট
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white/90">স্বাগতম — নিবন্ধন সম্পূর্ণ করুন</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        আপনার বর্তমান ভূমিকা: <span className="font-semibold text-brand-500">{ROLE_BN[role]}</span>
      </p>

      {message && (
        <div className="mt-4 rounded-xl border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          ⚠️ {error}
        </div>
      )}
      {hasProfile && !message && (
        <div className="mt-4 rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
          {status?.profileComplete
            ? "আপনার প্রোফাইল সম্পূর্ণ এবং সংরক্ষিত আছে।"
            : `আপনার প্রোফাইল সংরক্ষিত, তবে সম্পূর্ণ নয়। বাকি তথ্য: ${status?.missingFields.map((field) => FIELD_BN[field]).join(", ") || "—"}।`}
        </div>
      )}
      {status?.tenantRequest?.status === "pending" && (
        <div className="mt-4 rounded-xl border border-warning-500/30 bg-warning-50 px-4 py-3 text-sm text-warning-600 dark:bg-warning-500/10">
          আপনার টেন্যান্ট আবেদনটি অ্যাডমিনের অনুমোদনের অপেক্ষায় আছে। অনুমোদনের পর টেন্যান্ট ড্যাশবোর্ড খুলবে।
        </div>
      )}
      {status?.assistRequest?.status === "pending" && (
        <div className="mt-4 rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
          একজন টেন্যান্টকে দিয়ে প্রোফাইল পূরণের অনুরোধ অপেক্ষমাণ আছে। তথ্য সম্পূর্ণ হলে আপনার ড্যাশবোর্ড খুলবে।
        </div>
      )}

      <p className="mt-6 text-base font-medium text-gray-700 dark:text-gray-300">আপনি কী করতে চান?</p>
      <div className="mt-3 grid gap-3">
        <ChoiceCard active={choice === "self"} onClick={() => setChoice("self")} title="আমি নিজেই আমার তথ্য দেব" desc="AgriSense আপনাকে প্রশ্ন করে সহজে তথ্য নেবে।" />
        <ChoiceCard active={choice === "assist"} onClick={() => setChoice("assist")} title="একজন টেন্যান্টকে দিয়ে পূরণ করাব" desc="আপনার এলাকার টেন্যান্ট আপনার হয়ে তথ্য পূরণ করবেন।" />
        <ChoiceCard active={choice === "tenant"} onClick={() => setChoice("tenant")} title="আমি টেন্যান্ট হতে চাই" desc="অ্যাডমিনের অনুমোদন সাপেক্ষে আপনি টেন্যান্ট হবেন।" />
      </div>

      <div className="mt-5">
        {choice === "self" && <SelfOnboardChat />}
        {choice === "assist" && <AssistForm defaultName={user?.name} defaultPhone={status?.onboarding?.phone} busy={busy} onSubmit={(b) => run(() => requestAssist(b), "আপনার অনুরোধ পাঠানো হয়েছে। একজন টেন্যান্ট শীঘ্রই তথ্য পূরণ করবেন।")} />}
        {choice === "tenant" && <TenantForm defaultPhone={status?.onboarding?.phone} busy={busy} onSubmit={(b) => run(() => requestTenant(b), "টেন্যান্ট হওয়ার আবেদন জমা হয়েছে। অ্যাডমিন পর্যালোচনা করবেন।")} />}
      </div>

      {/* BDApps opt-in — independent of the intake choice; activates the SMS/pay
          channel on the current farmer via the existing OTP verify flow. */}
      <BdappsOptInCard phone={status?.onboarding?.phone} />
      </div>
    </div>
  );
}

function ChoiceCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-5 py-4 text-right transition ${
        active
          ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
          : "border-gray-200 bg-white hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
      }`}
    >
      <div className="text-base font-semibold text-gray-800 dark:text-white/90">{title}</div>
      <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{desc}</div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

function DistrictSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <EditableDistrictSelect className={inputCls} value={value} onChange={onChange} />;
}

function Card({ children }: { children: ReactNode }) {
  return <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">{children}</form>;
}

function TenantForm({ defaultPhone, busy, onSubmit }: { defaultPhone?: string; busy: boolean; onSubmit: (b: { orgName: string; district: string; upazila?: string; phone: string; note?: string }) => void }) {
  const [orgName, setOrgName] = useState("");
  const [district, setDistrict] = useState("");
  const [upazila, setUpazila] = useState("");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [note, setNote] = useState("");
  return (
    <Card>
      <LocationAutofill className="mb-4" onDetected={(found) => { setDistrict(found.district); setUpazila(found.upazila ?? ""); }} />
      <div className="grid gap-4">
        <Field label="প্রতিষ্ঠানের নাম"><input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="যেমন: কুষ্টিয়া কৃষি অফিস" /></Field>
        <Field label="জেলা"><DistrictSelect value={district} onChange={setDistrict} /></Field>
        <Field label="উপজেলা (পরিবর্তনযোগ্য)"><input className={inputCls} value={upazila} onChange={(e) => setUpazila(e.target.value)} /></Field>
        <Field label="মোবাইল নম্বর"><input required className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="017XXXXXXXX" /></Field>
        <Field label="মন্তব্য (ঐচ্ছিক)"><textarea className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <button type="button" disabled={busy || !orgName || !district || !phone.trim()} onClick={() => onSubmit({ orgName, district, upazila: upazila || undefined, phone: phone.trim(), note: note || undefined })}
        className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "অপেক্ষা করুন…" : "আবেদন জমা দিন"}
      </button>
    </Card>
  );
}

function AssistForm({ defaultName, defaultPhone, busy, onSubmit }: { defaultName?: string; defaultPhone?: string; busy: boolean; onSubmit: (b: { district: string; upazila?: string; fullName?: string; phone: string; note?: string }) => void }) {
  const [fullName, setFullName] = useState(defaultName ?? "");
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [district, setDistrict] = useState("");
  const [upazila, setUpazila] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card>
      <LocationAutofill className="mb-4" onDetected={(found) => { setDistrict(found.district); setUpazila(found.upazila ?? ""); }} />
      <div className="grid gap-4">
        <Field label="আপনার নাম"><input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="মোবাইল নম্বর"><input required type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="017XXXXXXXX" /></Field>
        <Field label="জেলা"><DistrictSelect value={district} onChange={setDistrict} /></Field>
        <Field label="উপজেলা (পরিবর্তনযোগ্য)"><input className={inputCls} value={upazila} onChange={(e) => setUpazila(e.target.value)} /></Field>
        <Field label="মন্তব্য (ঐচ্ছিক)"><textarea className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <button type="button" disabled={busy || !district || !phone.trim()} onClick={() => onSubmit({ district, upazila: upazila || undefined, fullName: fullName || undefined, phone: phone.trim(), note: note || undefined })}
        className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "অপেক্ষা করুন…" : "অনুরোধ পাঠান"}
      </button>
    </Card>
  );
}
