import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { getOnboardingMe, saveOwnProfile, type OnboardingMe, type OnboardingProfile } from "../api/onboarding.js";
import {
  sendAgriSenseMessage,
  type AgriSenseMessageResult,
  type CropRecommendation,
  type WeatherForecast,
  type SeasonPlanResult,
  type RetrievedEvidence,
} from "../api/agrisense.js";
import { getChannelStatus, requestBdappsOtp, verifyPhone, type ChannelStatus } from "../api/channel.js";
import PageMeta from "../components/common/PageMeta.js";
import { PortalLoader } from "../components/common/DashboardLanding.js";
import { useAuth } from "../context/AuthContext.js";

const SOIL: Record<string, string> = { sandy: "বেলে", loam: "দোআঁশ", clay: "এঁটেল", silt: "পলি" };
const WATER: Record<string, string> = { rainfed: "বৃষ্টিনির্ভর", limited_irrigation: "সীমিত সেচ", reliable_irrigation: "নিশ্চিত সেচ" };
const SEASON: Record<string, string> = { kharif1: "আউশ", kharif2_aman: "আমন", rabi: "রবি", boro: "বোরো" };
const LEVEL: Record<string, string> = { low: "কম", medium: "মাঝারি", high: "বেশি" };
const CROP_BN: Record<string, string> = {
  rice: "ধান", paddy: "ধান", dhan: "ধান",
  rice_boro: "বোরো ধান", boro: "বোরো ধান", "boro rice": "বোরো ধান",
  rice_t_aman: "আমন ধান", aman: "আমন ধান", "t. aman": "আমন ধান", "transplanted aman rice": "আমন ধান",
  wheat: "গম", maize: "ভুট্টা", potato: "আলু", mustard: "সরিষা", lentil: "মসুর ডাল", onion: "পেঁয়াজ", jute: "পাট",
};
const cropBn = (c: string): string => CROP_BN[c.trim().toLowerCase()] ?? c;
const taka = (n?: number): string => (n == null ? "—" : `৳${Math.round(n).toLocaleString("bn-BD")}`);
const bn = (n?: number): string => (n == null ? "—" : Math.round(n).toLocaleString("bn-BD"));
const pct = (s: number): number => (s > 1 ? Math.round(s) : Math.round(s * 100));
const day = (d?: string): string => (d ? d.slice(0, 10) : "");

// Bengali calendar (Bangladesh revised) month for a Gregorian date.
const BN_MONTH_STARTS: [number, number, string][] = [
  [1, 14, "মাঘ"], [2, 13, "ফাল্গুন"], [3, 15, "চৈত্র"], [4, 14, "বৈশাখ"],
  [5, 15, "জ্যৈষ্ঠ"], [6, 15, "আষাঢ়"], [7, 16, "শ্রাবণ"], [8, 16, "ভাদ্র"],
  [9, 16, "আশ্বিন"], [10, 16, "কার্তিক"], [11, 15, "অগ্রহায়ণ"], [12, 15, "পৌষ"],
];
function bnMonthName(date: Date): string {
  const m = date.getMonth() + 1, d = date.getDate();
  let name = "পৌষ"; // Jan 1–13 belongs to পৌষ (started Dec 15)
  for (const [bm, bd, nm] of BN_MONTH_STARTS) if (m > bm || (m === bm && d >= bd)) name = nm;
  return name;
}
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const EN_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
/** Bengali month + English month for a date, e.g. "বৈশাখ · April". */
function monthLabel(date: Date): string {
  return `${bnMonthName(new Date(date.getFullYear(), date.getMonth(), 15))} · ${EN_MONTHS[date.getMonth()]}`;
}

type Tab = "home" | "weather" | "crops" | "plan" | "money" | "why" | "profile";

export default function UserDashboard() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const tab: Tab = (params.get("tab") as Tab) || "home";
  const [status, setStatus] = useState<OnboardingMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgriSenseMessageResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { setStatus(await getOnboardingMe()); }
    catch (err) { setError(err instanceof Error ? err.message : "ড্যাশবোর্ড লোড করা যায়নি"); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const profile = status?.onboarding;
  const profileMessage = useMemo(() => {
    if (!profile) return "";
    const parts = [
      profile.district ? `আমার জমি ${profile.district} জেলায়` : "",
      profile.farmSizeDecimals != null ? `${profile.farmSizeDecimals} শতক` : "",
      profile.soilTexture ? `${SOIL[profile.soilTexture] ?? profile.soilTexture} মাটি` : "",
      profile.waterAvailability ? WATER[profile.waterAvailability] ?? profile.waterAvailability : "",
      profile.budgetBdt != null ? `বাজেট ${profile.budgetBdt} টাকা` : "",
      profile.targetSeason ? `${SEASON[profile.targetSeason] ?? profile.targetSeason} মৌসুম` : "",
    ].filter(Boolean);
    return `${parts.join(", ")}। আমার জন্য সবচেয়ে লাভজনক ফসল কোনটি, মৌসুম পরিকল্পনা ও খরচ-লাভসহ জানাও।`;
  }, [profile]);

  async function run(message: string) {
    if (!message.trim()) return;
    setBusy(true); setRunError(null);
    try {
      setResult(await sendAgriSenseMessage({ message, preferredLanguage: "bn", workflowStage: "full" }));
    } catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "পরামর্শ তৈরি করা যায়নি। একটু পরে আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  if (user?.role !== "user") return <Navigate to="/" replace />;
  if (!status && !error) return <PortalLoader />;
  if (status && !status.profileComplete) return <Navigate to="/onboarding" replace />;

  const need = <NeedAdvice busy={busy} onRun={() => void run(profileMessage)} error={runError} />;

  return (
    <>
      <PageMeta title="আমার ড্যাশবোর্ড · AgriSense" description="সহজ কৃষি পরামর্শ" />
      <section className="portal-intro">
        <div>
          <p className="portal-kicker">কৃষক ড্যাশবোর্ড</p>
          <h1 className="portal-title">স্বাগতম, {profile?.fullName || user.name} 🌾</h1>
          <p className="portal-lede">আপনার খামারের তথ্য অনুযায়ী সহজ ভাষায় পরামর্শ, আবহাওয়া, পরিকল্পনা ও খরচ-লাভ দেখুন।</p>
        </div>
        <span className="portal-status portal-status--success">✓ প্রোফাইল সম্পূর্ণ</span>
      </section>

      {error ? <div className="portal-alert portal-alert--error">{error}</div> : null}

      {tab === "home" && <HomeTab profile={profile ?? null} result={result} busy={busy} onRun={() => void run(profileMessage)} onAsk={(q) => void run(q)} error={runError} />}
      {tab === "weather" && (result?.weather ? <WeatherTab weather={result.weather} /> : need)}
      {tab === "crops" && (result?.cropRankings?.length ? <CropsTab crops={result.cropRankings} /> : need)}
      {tab === "plan" && (result?.seasonPlan ? <PlanTab plan={result.seasonPlan} /> : need)}
      {tab === "money" && (result?.seasonPlan ? <MoneyTab plan={result.seasonPlan} /> : need)}
      {tab === "why" && (result ? <WhyTab profile={profile ?? null} result={result} /> : need)}
      {tab === "profile" && <ProfileTab profile={profile ?? null} onSaved={reload} />}
    </>
  );
}

function NeedAdvice({ busy, onRun, error }: { busy: boolean; onRun: () => void; error: string | null }) {
  return (
    <section className="portal-workbench">
      <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">এই তথ্য দেখতে আগে পরামর্শ তৈরি করুন।</p>
      <button type="button" onClick={onRun} disabled={busy} className="portal-button portal-button--primary w-full text-base">
        {busy ? "পরামর্শ তৈরি হচ্ছে…" : "🌱 আমার জন্য পরামর্শ তৈরি করুন"}
      </button>
      {error ? <p className="portal-inline-message portal-inline-message--error mt-3" role="alert">{error}</p> : null}
    </section>
  );
}

function HomeTab({ profile, result, busy, onRun, onAsk, error }: {
  profile: OnboardingMe["onboarding"]; result: AgriSenseMessageResult | null; busy: boolean; onRun: () => void; onAsk: (q: string) => void; error: string | null;
}) {
  const [question, setQuestion] = useState("");
  const top = result?.cropRankings?.[0];
  function submit(e: FormEvent) { e.preventDefault(); if (question.trim()) onAsk(question.trim()); }

  return (
    <div className="space-y-4">
      <section className="portal-workbench">
        <div className="portal-section-heading"><div><h2>আজকের পরামর্শ</h2><p>এক চাপে জেনে নিন আপনার জমিতে কোন ফসল ভালো হবে।</p></div></div>
        {!result && (
          <button type="button" onClick={onRun} disabled={busy} className="portal-button portal-button--primary w-full text-base">
            {busy ? "পরামর্শ তৈরি হচ্ছে…" : "🌱 আমার জন্য সেরা ফসল দেখুন"}
          </button>
        )}
        {error ? <p className="portal-inline-message portal-inline-message--error" role="alert">{error}</p> : null}

        {top && (
          <div className="mt-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 dark:border-brand-500/30 dark:bg-brand-500/10">
            <p className="text-sm text-gray-500 dark:text-gray-400">আপনার জমির জন্য সেরা ফসল</p>
            <p className="mt-1 text-2xl font-bold text-brand-700 dark:text-brand-300">{cropBn(top.crop)}</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Tile label="সম্ভাব্য লাভ" value={taka(top.netProfitBdt)} />
              <Tile label="পানির প্রয়োজন" value={LEVEL[top.waterNeed] ?? top.waterNeed} />
              <Tile label="ঝুঁকি" value={LEVEL[top.riskLevel] ?? top.riskLevel} />
            </div>
          </div>
        )}
        {result?.assistantMessage && (
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <p className="mb-1 text-xs font-medium text-brand-600 dark:text-brand-300">🤖 AgriSense বলছে</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-100">{result.assistantMessage}</p>
          </div>
        )}
        <form onSubmit={submit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <input className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="যেকোনো প্রশ্ন লিখুন — যেমন: সার কখন দেব?" />
          <button type="submit" disabled={busy || !question.trim()} className="portal-button portal-button--quiet whitespace-nowrap">{busy ? "…" : "প্রশ্ন করুন"}</button>
        </form>
      </section>

      <section className="portal-workbench">
        <div className="portal-section-heading"><div><h2>আপনার খামার</h2><p>{profile?.filledBy === "tenant" ? "একজন টেন্যান্ট আপনার হয়ে তথ্য দিয়েছেন।" : "আপনি নিজে তথ্য দিয়েছেন।"}</p></div><Link to="/user/dashboard?tab=profile" className="portal-button portal-button--quiet">তথ্য বদলান</Link></div>
        <dl className="portal-profile-grid">
          <ProfileItem label="জেলা" value={profile?.district} />
          <ProfileItem label="জমি" value={profile?.farmSizeDecimals != null ? `${profile.farmSizeDecimals} শতক` : undefined} />
          <ProfileItem label="মাটি" value={profile?.soilTexture ? SOIL[profile.soilTexture] ?? profile.soilTexture : undefined} />
          <ProfileItem label="সেচ" value={profile?.waterAvailability ? WATER[profile.waterAvailability] ?? profile.waterAvailability : undefined} />
          <ProfileItem label="বাজেট" value={profile?.budgetBdt != null ? taka(profile.budgetBdt) : undefined} />
          <ProfileItem label="মৌসুম" value={profile?.targetSeason ? SEASON[profile.targetSeason] ?? profile.targetSeason : undefined} />
        </dl>
      </section>

      {profile?.phone ? <ChannelCard phone={profile.phone} /> : null}
    </div>
  );
}

/**
 * BDApps SMS-channel activation. A logged-in farmer verifies their phone (OTP)
 * so AgriSense can text weather/pest alerts. Activates the channel on THIS
 * account — no new login.
 */
function ChannelCard({ phone }: { phone: string }) {
  const [status, setStatus] = useState<ChannelStatus | null>(null);
  const [step, setStep] = useState<"idle" | "otp">("idle");
  const [referenceNo, setReferenceNo] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getChannelStatus(phone).then(setStatus).catch(() => setStatus({ active: false, premium: false }));
  }, [phone]);

  async function sendOtp() {
    setBusy(true); setMsg(null);
    try {
      const { referenceNo } = await requestBdappsOtp(phone);
      setReferenceNo(referenceNo);
      setStep("otp");
      setMsg("আপনার মোবাইলে একটি কোড পাঠানো হয়েছে।");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "কোড পাঠানো যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true); setMsg(null);
    try {
      const res = await verifyPhone({ referenceNo, otp, mobile: phone });
      if (res.channelActive) {
        setStatus({ active: true, premium: status?.premium ?? false });
        setStep("idle");
        setMsg(null);
      } else {
        setMsg("চ্যানেল সক্রিয় হয়নি। সাবস্ক্রিপশন নিশ্চিত করার পর আবার চেষ্টা করুন।");
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "কোড যাচাই করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portal-workbench" aria-labelledby="sms-channel-title">
      <div className="portal-section-heading">
        <div>
          <h2 id="sms-channel-title">এসএমএস সতর্কতা</h2>
          <p>আবহাওয়া ও পোকা-রোগের সতর্কবার্তা সরাসরি আপনার মোবাইলে পান — অ্যাপ খোলা ছাড়াই।</p>
        </div>
        {status?.active ? <span className="portal-status portal-status--success">✓ চালু আছে</span> : null}
      </div>

      {status === null ? (
        <p>লোড হচ্ছে…</p>
      ) : status.active ? (
        <p>আপনার নম্বর <strong>{phone}</strong> যাচাই করা হয়েছে। AgriSense আপনাকে গুরুত্বপূর্ণ সতর্কবার্তা এসএমএস করবে।</p>
      ) : step === "idle" ? (
        <div>
          <p>এসএমএস সতর্কতা চালু করতে আপনার নম্বর <strong>{phone}</strong> যাচাই করুন।</p>
          <button type="button" className="portal-button" disabled={busy} onClick={() => void sendOtp()}>
            {busy ? "পাঠানো হচ্ছে…" : "কোড পাঠান ও যাচাই করুন"}
          </button>
        </div>
      ) : (
        <div className="portal-otp">
          <label htmlFor="otp-input">মোবাইলে আসা কোডটি লিখুন</label>
          <input id="otp-input" value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" placeholder="৬ ডিজিটের কোড" />
          <button type="button" className="portal-button" disabled={busy || otp.trim().length < 4} onClick={() => void confirm()}>
            {busy ? "যাচাই হচ্ছে…" : "যাচাই করুন"}
          </button>
        </div>
      )}

      {msg ? <p className="portal-hint">{msg}</p> : null}
    </section>
  );
}

function WeatherTab({ weather }: { weather: WeatherForecast }) {
  const next = weather.daily.slice(0, 7);
  const rain = next.reduce((s, d) => s + (d.rainfallMm || 0), 0);
  const tmin = next.length ? Math.min(...next.map((d) => d.temperatureMinC)) : undefined;
  const tmax = next.length ? Math.max(...next.map((d) => d.temperatureMaxC)) : undefined;
  return (
    <section className="portal-workbench">
      <div className="portal-section-heading">
        <div><h2>আবহাওয়া</h2><p>{weather.locationText} · {weather.provider === "mock" ? "নমুনা তথ্য" : "সরাসরি আবহাওয়া সেবা (Open-Meteo)"}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="আগামী ৭ দিনে বৃষ্টি" value={`${bn(rain)} মিমি`} />
        <Tile label="সর্বনিম্ন তাপমাত্রা" value={tmin != null ? `${bn(tmin)}°C` : "—"} />
        <Tile label="সর্বোচ্চ তাপমাত্রা" value={tmax != null ? `${bn(tmax)}°C` : "—"} />
      </div>
      <div className="mt-4 space-y-2">
        {next.map((d) => (
          <div key={d.date} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800">
            <span className="font-medium text-gray-800 dark:text-gray-100">{day(d.date)}</span>
            <span className="text-gray-500 dark:text-gray-400">🌧️ {bn(d.rainfallMm)} মিমি · 🌡️ {bn(d.temperatureMinC)}–{bn(d.temperatureMaxC)}°C</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-400">এই তথ্য প্রকৃত আবহাওয়া সেবা থেকে নেওয়া — কোনো অনুমান নয়।</p>
    </section>
  );
}

function CropsTab({ crops }: { crops: CropRecommendation[] }) {
  return (
    <section className="portal-workbench">
      <div className="portal-section-heading"><div><h2>ফসলের পরামর্শ</h2><p>আপনার জমি, মৌসুম ও আবহাওয়া অনুযায়ী সেরা ফসলগুলো।</p></div></div>
      <div className="space-y-3">
        {crops.map((c, i) => (
          <div key={c.crop} className={`rounded-2xl border p-4 ${i === 0 ? "border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10" : "border-gray-200 dark:border-gray-800"}`}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{i === 0 ? "⭐ " : ""}{cropBn(c.crop)}</span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-brand-600 dark:bg-white/[0.06] dark:text-brand-300">উপযুক্ততা {pct(c.suitabilityScore)}%</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <Tile label="সম্ভাব্য লাভ" value={taka(c.netProfitBdt)} />
              <Tile label="পানি" value={LEVEL[c.waterNeed] ?? c.waterNeed} />
              <Tile label="ঝুঁকি" value={LEVEL[c.riskLevel] ?? c.riskLevel} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PlanTab({ plan }: { plan: SeasonPlanResult }) {
  // Build the month span (bpন → harvest) and group tasks by Gregorian month.
  const months = useMemo(() => {
    const startISO = plan.tasks[0]?.startDate ?? plan.sowDate;
    const endISO = plan.harvestEndDate ?? plan.tasks[plan.tasks.length - 1]?.endDate ?? startISO;
    const s = new Date(startISO); s.setDate(1);
    const e = new Date(endISO);
    const list: { key: string; date: Date }[] = [];
    const cur = new Date(s);
    while (cur <= e && list.length < 18) { list.push({ key: monthKey(cur), date: new Date(cur) }); cur.setMonth(cur.getMonth() + 1); }
    if (list.length === 0) list.push({ key: monthKey(s), date: s });
    return list;
  }, [plan]);

  const tasksByMonth = useMemo(() => {
    const m = new Map<string, typeof plan.tasks>();
    for (const t of plan.tasks) {
      const k = (t.startDate ?? "").slice(0, 7);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return m;
  }, [plan]);

  const firstWithTasks = months.find((mm) => (tasksByMonth.get(mm.key)?.length ?? 0) > 0)?.key ?? months[0].key;
  const [selected, setSelected] = useState<string>(firstWithTasks);
  const activeTasks = tasksByMonth.get(selected) ?? [];
  const activeDate = months.find((mm) => mm.key === selected)?.date ?? months[0].date;

  return (
    <section className="portal-workbench">
      <div className="portal-section-heading">
        <div>
          <h2>মৌসুম পরিকল্পনা — {cropBn(plan.crop)}</h2>
          <p>বপন {bnMonthName(new Date(plan.sowDate))} ({day(plan.sowDate)}) → ফসল কাটা {bnMonthName(new Date(plan.harvestStartDate))} ({day(plan.harvestStartDate)})</p>
        </div>
      </div>

      {/* Interactive month strip — Bengali + English */}
      <div className="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="মাস">
        {months.map((mm) => {
          const count = tasksByMonth.get(mm.key)?.length ?? 0;
          const on = mm.key === selected;
          return (
            <button
              key={mm.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(mm.key)}
              className={`min-w-[92px] shrink-0 rounded-xl border px-3 py-2 text-center transition ${
                on ? "border-brand-500 bg-brand-50 dark:border-brand-500 dark:bg-brand-500/10"
                   : "border-gray-200 bg-white hover:border-brand-300 dark:border-gray-800 dark:bg-white/[0.03]"
              }`}
            >
              <div className="text-sm font-bold text-gray-800 dark:text-gray-100">{bnMonthName(new Date(mm.date.getFullYear(), mm.date.getMonth(), 15))}</div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">{EN_SHORT[mm.date.getMonth()]} {mm.date.getFullYear()}</div>
              {count > 0 ? <div className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-[11px] font-bold text-white">{bn(count)}</div>
                        : <div className="mt-1 text-[11px] text-gray-300 dark:text-gray-600">—</div>}
            </button>
          );
        })}
      </div>

      <p className="mb-3 mt-1 text-sm font-semibold text-brand-600 dark:text-brand-300">{monthLabel(activeDate)}</p>

      {activeTasks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">এই মাসে নির্দিষ্ট কোনো কাজ নেই।</div>
      ) : (
        <ol className="space-y-3">
          {activeTasks.map((t, i) => (
            <li key={i} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{bn(i + 1)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{t.title}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
                      {bnMonthName(new Date(t.startDate))} · {day(t.startDate)}{t.endDate && t.endDate !== t.startDate ? ` – ${day(t.endDate)}` : ""}
                    </span>
                  </div>
                  {t.description ? <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{t.description}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-gray-500 dark:text-gray-400">
                    {t.quantity != null ? <span>পরিমাণ: {bn(t.quantity)} {t.unit ?? ""}</span> : null}
                    {t.totalCostBdt != null ? <span>খরচ: {taka(t.totalCostBdt)}</span> : null}
                    {t.organicAlternative ? <span>জৈব বিকল্প: {t.organicAlternative}</span> : null}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-gray-400">মাসে চাপ দিয়ে সেই সময়ের কাজ দেখুন। তারিখ বাংলা ও ইংরেজি — দুইভাবেই দেখানো হয়েছে।</p>
    </section>
  );
}

function MoneyTab({ plan }: { plan: SeasonPlanResult }) {
  const f = plan.financials;
  return (
    <section className="portal-workbench">
      <div className="portal-section-heading"><div><h2>খরচ ও লাভ — {cropBn(plan.crop)}</h2><p>সব হিসাব আপনার জমি ও বর্তমান বাজারদর অনুযায়ী।</p></div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="সম্ভাব্য ফলন" value={`${bn(f.expectedYieldKg)} কেজি`} />
        <Tile label="সম্ভাব্য আয়" value={taka(f.expectedRevenueBdt)} />
        <Tile label="মোট খরচ" value={taka(f.totalCostBdt)} />
        <Tile label="নিট লাভ" value={taka(f.netProfitBdt)} />
        <Tile label="লাভের হার (ROI)" value={`${bn(f.roiPct)}%`} />
        <Tile label="খরচ ওঠার ফলন" value={`${bn(f.breakEvenYieldKg)} কেজি`} />
      </div>
      {f.costBreakdown?.length ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">খরচের বিস্তারিত</p>
          <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
            {f.costBreakdown.map((c, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="text-gray-700 dark:text-gray-200">{c.label}</span>
                <span className="font-medium text-gray-800 dark:text-gray-100">{taka(c.amountBdt)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-gray-400">তথ্য বদলালে (জমি/বাজেট) এই হিসাবও বদলে যাবে।</p>
    </section>
  );
}

function WhyTab({ profile, result }: { profile: OnboardingMe["onboarding"]; result: AgriSenseMessageResult }) {
  const reason = result.seasonPlan?.selectedCropReason || result.cropRankings?.[0]?.reasoning;
  const evidence: RetrievedEvidence[] = result.retrievedEvidence ?? result.seasonPlan?.retrievedEvidence ?? [];
  return (
    <section className="portal-workbench space-y-4">
      <div className="portal-section-heading"><div><h2>কেন এই পরামর্শ?</h2><p>কোন তথ্যের উপর ভিত্তি করে পরামর্শ দেওয়া হয়েছে।</p></div></div>

      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">আপনার যে তথ্য ব্যবহার হয়েছে</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {profile?.district ? <Chip>জেলা: {profile.district}</Chip> : null}
          {profile?.soilTexture ? <Chip>মাটি: {SOIL[profile.soilTexture] ?? profile.soilTexture}</Chip> : null}
          {profile?.waterAvailability ? <Chip>সেচ: {WATER[profile.waterAvailability] ?? profile.waterAvailability}</Chip> : null}
          {profile?.targetSeason ? <Chip>মৌসুম: {SEASON[profile.targetSeason] ?? profile.targetSeason}</Chip> : null}
          {result.weather ? <Chip>আবহাওয়া: {result.weather.locationText}</Chip> : null}
        </div>
      </div>

      {reason ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <p className="mb-1 text-xs font-medium text-brand-600 dark:text-brand-300">কারণ</p>
          <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{reason}</p>
        </div>
      ) : null}

      {evidence.length ? (
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">তথ্যসূত্র</p>
          <div className="space-y-2">
            {evidence.slice(0, 6).map((e) => (
              <div key={e.id} className="rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium text-gray-800 dark:text-gray-100">{e.title}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">{e.source}</span>
                </div>
                <p className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{e.citation ?? e.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

const SOIL_OPTS = [{ v: "sandy", bn: "বেলে" }, { v: "loam", bn: "দোআঁশ" }, { v: "clay", bn: "এঁটেল" }, { v: "silt", bn: "পলি" }];
const WATER_OPTS = [{ v: "rainfed", bn: "বৃষ্টিনির্ভর" }, { v: "limited_irrigation", bn: "সীমিত সেচ" }, { v: "reliable_irrigation", bn: "নিশ্চিত সেচ" }];
const SEASON_OPTS = [{ v: "kharif1", bn: "আউশ" }, { v: "kharif2_aman", bn: "আমন" }, { v: "rabi", bn: "রবি" }, { v: "boro", bn: "বোরো" }];
const fieldCls = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";

/** Editable farmer profile — updates in place (does not go through onboarding). */
function ProfileTab({ profile, onSaved }: { profile: OnboardingProfile | null; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? "", phone: profile?.phone ?? "", district: profile?.district ?? "", upazila: profile?.upazila ?? "",
    farmSizeDecimals: profile?.farmSizeDecimals != null ? String(profile.farmSizeDecimals) : "",
    soilTexture: profile?.soilTexture ?? "", waterAvailability: profile?.waterAvailability ?? "",
    budgetBdt: profile?.budgetBdt != null ? String(profile.budgetBdt) : "", targetSeason: profile?.targetSeason ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((o) => ({ ...o, [k]: v }));
  const valid = form.district.trim() && form.phone.trim();

  async function save() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const body: OnboardingProfile = {
        district: form.district.trim(), phone: form.phone.trim(),
        fullName: form.fullName.trim() || undefined, upazila: form.upazila.trim() || undefined,
        farmSizeDecimals: form.farmSizeDecimals ? Number(form.farmSizeDecimals) : undefined,
        soilTexture: form.soilTexture || undefined, waterAvailability: form.waterAvailability || undefined,
        budgetBdt: form.budgetBdt ? Number(form.budgetBdt) : undefined, targetSeason: form.targetSeason || undefined,
      };
      await saveOwnProfile(body);
      await onSaved();
      setMsg("আপনার তথ্য হালনাগাদ হয়েছে।");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "সংরক্ষণ করা যায়নি।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portal-workbench">
      <div className="portal-section-heading"><div><h2>আমার তথ্য</h2><p>আপনার খামারের তথ্য এখানে হালনাগাদ করুন।</p></div></div>
      {msg ? <p className="portal-inline-message portal-inline-message--success" role="status">✓ {msg}</p> : null}
      {err ? <p className="portal-inline-message portal-inline-message--error" role="alert">{err}</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="পূর্ণ নাম"><input className={fieldCls} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></Field>
        <Field label="মোবাইল নম্বর *"><input className={fieldCls} value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="017XXXXXXXX" /></Field>
        <Field label="জেলা *"><input className={fieldCls} value={form.district} onChange={(e) => set("district", e.target.value)} /></Field>
        <Field label="উপজেলা"><input className={fieldCls} value={form.upazila} onChange={(e) => set("upazila", e.target.value)} /></Field>
        <Field label="জমির পরিমাণ (শতক)"><input type="number" className={fieldCls} value={form.farmSizeDecimals} onChange={(e) => set("farmSizeDecimals", e.target.value)} /></Field>
        <Field label="বাজেট (টাকা)"><input type="number" className={fieldCls} value={form.budgetBdt} onChange={(e) => set("budgetBdt", e.target.value)} /></Field>
        <Field label="মাটির ধরন">
          <select className={fieldCls} value={form.soilTexture} onChange={(e) => set("soilTexture", e.target.value)}>
            <option value="">— নির্বাচন —</option>{SOIL_OPTS.map((s) => <option key={s.v} value={s.v}>{s.bn}</option>)}
          </select>
        </Field>
        <Field label="সেচ সুবিধা">
          <select className={fieldCls} value={form.waterAvailability} onChange={(e) => set("waterAvailability", e.target.value)}>
            <option value="">— নির্বাচন —</option>{WATER_OPTS.map((w) => <option key={w.v} value={w.v}>{w.bn}</option>)}
          </select>
        </Field>
        <Field label="মৌসুম">
          <select className={fieldCls} value={form.targetSeason} onChange={(e) => set("targetSeason", e.target.value)}>
            <option value="">— নির্বাচন —</option>{SEASON_OPTS.map((s) => <option key={s.v} value={s.v}>{s.bn}</option>)}
          </select>
        </Field>
      </div>
      <button type="button" onClick={() => void save()} disabled={busy || !valid} className="portal-button portal-button--primary mt-5 w-full">
        {busy ? "সংরক্ষণ হচ্ছে…" : "হালনাগাদ করুন"}
      </button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>{children}</label>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{children}</span>;
}
function Tile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/70 p-3 text-center dark:bg-white/[0.04]"><p className="text-xs text-gray-500 dark:text-gray-400">{label}</p><p className="mt-0.5 text-base font-bold text-gray-800 dark:text-gray-100">{value}</p></div>;
}
function ProfileItem({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}
