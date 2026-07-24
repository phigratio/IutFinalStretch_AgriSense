import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import {
  getOnboardingMe,
  requestTenant,
  saveOwnProfile,
  requestAssist,
  type UserRole,
  type OnboardingProfile,
} from "../api/onboarding.js";

// Bengali option maps -> canonical backend values.
const DISTRICTS = ["Kushtia", "Bogura", "Dhaka", "Rangpur", "Rajshahi", "Dinajpur", "Cumilla", "Jashore", "Mymensingh", "Barishal"];
const DISTRICT_BN: Record<string, string> = {
  Kushtia: "কুষ্টিয়া", Bogura: "বগুড়া", Dhaka: "ঢাকা", Rangpur: "রংপুর", Rajshahi: "রাজশাহী",
  Dinajpur: "দিনাজপুর", Cumilla: "কুমিল্লা", Jashore: "যশোর", Mymensingh: "ময়মনসিংহ", Barishal: "বরিশাল",
};
const SOILS = [{ v: "sandy", bn: "বেলে" }, { v: "loam", bn: "দোআঁশ" }, { v: "clay", bn: "এঁটেল" }, { v: "silt", bn: "পলি" }];
const WATERS = [{ v: "rainfed", bn: "বৃষ্টিনির্ভর" }, { v: "limited_irrigation", bn: "সীমিত সেচ" }, { v: "reliable_irrigation", bn: "নিশ্চিত সেচ" }];
const SEASONS = [{ v: "kharif1", bn: "আউশ" }, { v: "kharif2_aman", bn: "আমন" }, { v: "rabi", bn: "রবি" }, { v: "boro", bn: "বোরো" }];

const ROLE_BN: Record<UserRole, string> = { user: "ব্যবহারকারী", tenant: "টেন্যান্ট", admin: "অ্যাডমিন" };

type Choice = "tenant" | "self" | "assist";

export default function Onboarding() {
  const { user, logout } = useAuth();
  const [role, setRole] = useState<UserRole>("user");
  const [hasProfile, setHasProfile] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getOnboardingMe()
      .then((me) => {
        setRole(me.role);
        setHasProfile(Boolean(me.onboarding));
      })
      .catch(() => undefined);
  }, [message]);

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
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
          আপনার প্রোফাইল ইতিমধ্যে সংরক্ষিত আছে। চাইলে নিচে থেকে হালনাগাদ করতে পারেন।
        </div>
      )}

      <p className="mt-6 text-base font-medium text-gray-700 dark:text-gray-300">আপনি কী করতে চান?</p>
      <div className="mt-3 grid gap-3">
        <ChoiceCard active={choice === "self"} onClick={() => setChoice("self")} title="আমি নিজেই আমার তথ্য দেব" desc="নিজের খামারের তথ্য পূরণ করুন।" />
        <ChoiceCard active={choice === "assist"} onClick={() => setChoice("assist")} title="একজন টেন্যান্টকে দিয়ে পূরণ করাব" desc="আপনার এলাকার টেন্যান্ট আপনার হয়ে তথ্য পূরণ করবেন।" />
        <ChoiceCard active={choice === "tenant"} onClick={() => setChoice("tenant")} title="আমি টেন্যান্ট হতে চাই" desc="অ্যাডমিনের অনুমোদন সাপেক্ষে আপনি টেন্যান্ট হবেন।" />
      </div>

      <div className="mt-5">
        {choice === "self" && <SelfProfileForm busy={busy} onSubmit={(b) => run(() => saveOwnProfile(b), "আপনার প্রোফাইল সংরক্ষিত হয়েছে।")} />}
        {choice === "assist" && <AssistForm busy={busy} onSubmit={(b) => run(() => requestAssist(b), "আপনার অনুরোধ পাঠানো হয়েছে। একজন টেন্যান্ট শীঘ্রই তথ্য পূরণ করবেন।")} />}
        {choice === "tenant" && <TenantForm busy={busy} onSubmit={(b) => run(() => requestTenant(b), "টেন্যান্ট হওয়ার আবেদন জমা হয়েছে। অ্যাডমিন পর্যালোচনা করবেন।")} />}
      </div>
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
  return (
    <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— জেলা নির্বাচন করুন —</option>
      {DISTRICTS.map((d) => (
        <option key={d} value={d}>{DISTRICT_BN[d]} ({d})</option>
      ))}
    </select>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <form onSubmit={(e) => e.preventDefault()} className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">{children}</form>;
}

function TenantForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: { orgName: string; district: string; note?: string }) => void }) {
  const [orgName, setOrgName] = useState("");
  const [district, setDistrict] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card>
      <div className="grid gap-4">
        <Field label="প্রতিষ্ঠানের নাম"><input className={inputCls} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="যেমন: কুষ্টিয়া কৃষি অফিস" /></Field>
        <Field label="জেলা"><DistrictSelect value={district} onChange={setDistrict} /></Field>
        <Field label="মন্তব্য (ঐচ্ছিক)"><textarea className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <button type="button" disabled={busy || !orgName || !district} onClick={() => onSubmit({ orgName, district, note: note || undefined })}
        className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "অপেক্ষা করুন…" : "আবেদন জমা দিন"}
      </button>
    </Card>
  );
}

function AssistForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: { district: string; fullName?: string; phone?: string; note?: string }) => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState("");
  const [note, setNote] = useState("");
  return (
    <Card>
      <div className="grid gap-4">
        <Field label="আপনার নাম"><input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="মোবাইল নম্বর"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="017XXXXXXXX" /></Field>
        <Field label="জেলা"><DistrictSelect value={district} onChange={setDistrict} /></Field>
        <Field label="মন্তব্য (ঐচ্ছিক)"><textarea className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></Field>
      </div>
      <button type="button" disabled={busy || !district} onClick={() => onSubmit({ district, fullName: fullName || undefined, phone: phone || undefined, note: note || undefined })}
        className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
        {busy ? "অপেক্ষা করুন…" : "অনুরোধ পাঠান"}
      </button>
    </Card>
  );
}

function SelfProfileForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: OnboardingProfile) => void }) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [district, setDistrict] = useState("");
  const [farmSizeDecimals, setSize] = useState("");
  const [soilTexture, setSoil] = useState("");
  const [waterAvailability, setWater] = useState("");
  const [budgetBdt, setBudget] = useState("");
  const [targetSeason, setSeason] = useState("");
  return (
    <Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="আপনার নাম"><input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
        <Field label="মোবাইল নম্বর"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        <Field label="জেলা"><DistrictSelect value={district} onChange={setDistrict} /></Field>
        <Field label="জমির পরিমাণ (শতক)"><input type="number" className={inputCls} value={farmSizeDecimals} onChange={(e) => setSize(e.target.value)} /></Field>
        <Field label="মাটির ধরন">
          <select className={inputCls} value={soilTexture} onChange={(e) => setSoil(e.target.value)}>
            <option value="">— নির্বাচন —</option>
            {SOILS.map((s) => <option key={s.v} value={s.v}>{s.bn}</option>)}
          </select>
        </Field>
        <Field label="সেচ সুবিধা">
          <select className={inputCls} value={waterAvailability} onChange={(e) => setWater(e.target.value)}>
            <option value="">— নির্বাচন —</option>
            {WATERS.map((w) => <option key={w.v} value={w.v}>{w.bn}</option>)}
          </select>
        </Field>
        <Field label="বাজেট (টাকা)"><input type="number" className={inputCls} value={budgetBdt} onChange={(e) => setBudget(e.target.value)} /></Field>
        <Field label="মৌসুম">
          <select className={inputCls} value={targetSeason} onChange={(e) => setSeason(e.target.value)}>
            <option value="">— নির্বাচন —</option>
            {SEASONS.map((s) => <option key={s.v} value={s.v}>{s.bn}</option>)}
          </select>
        </Field>
      </div>
      <button
        type="button"
        disabled={busy || !district}
        onClick={() =>
          onSubmit({
            district, fullName: fullName || undefined, phone: phone || undefined,
            farmSizeDecimals: farmSizeDecimals ? Number(farmSizeDecimals) : undefined,
            soilTexture: soilTexture || undefined, waterAvailability: waterAvailability || undefined,
            budgetBdt: budgetBdt ? Number(budgetBdt) : undefined, targetSeason: targetSeason || undefined,
          })
        }
        className="mt-4 w-full rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
      >
        {busy ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
      </button>
    </Card>
  );
}
