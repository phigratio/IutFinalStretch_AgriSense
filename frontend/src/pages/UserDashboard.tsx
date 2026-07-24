import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { getOnboardingMe, type OnboardingMe } from "../api/onboarding.js";
import { sendAgriSenseMessage, type AgriSenseMessageResult, type CropRecommendation } from "../api/agrisense.js";
import PageMeta from "../components/common/PageMeta.js";
import { PortalLoader } from "../components/common/DashboardLanding.js";
import { useAuth } from "../context/AuthContext.js";

const SOIL: Record<string, string> = { sandy: "বেলে", loam: "দোআঁশ", clay: "এঁটেল", silt: "পলি" };
const WATER: Record<string, string> = { rainfed: "বৃষ্টিনির্ভর", limited_irrigation: "সীমিত সেচ", reliable_irrigation: "নিশ্চিত সেচ" };
const SEASON: Record<string, string> = { kharif1: "আউশ", kharif2_aman: "আমন", rabi: "রবি", boro: "বোরো" };
const LEVEL: Record<string, string> = { low: "কম", medium: "মাঝারি", high: "বেশি" };

const CROP_BN: Record<string, string> = {
  rice_boro: "বোরো ধান", boro: "বোরো ধান", "boro rice": "বোরো ধান",
  rice_t_aman: "আমন ধান", aman: "আমন ধান", "t. aman": "আমন ধান", "transplanted aman rice": "আমন ধান",
  wheat: "গম", maize: "ভুট্টা", potato: "আলু", mustard: "সরিষা", lentil: "মসুর ডাল", onion: "পেঁয়াজ", jute: "পাট",
};
const cropBn = (crop: string): string => CROP_BN[crop.trim().toLowerCase()] ?? crop;
const taka = (n?: number): string => (n == null ? "—" : `৳${Math.round(n).toLocaleString("bn-BD")}`);

export default function UserDashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<OnboardingMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOnboardingMe().then(setStatus).catch((err: unknown) => setError(err instanceof Error ? err.message : "ড্যাশবোর্ড লোড করা যায়নি"));
  }, []);

  if (user?.role !== "user") return <Navigate to="/" replace />;
  if (!status && !error) return <PortalLoader />;
  if (status && !status.profileComplete) return <Navigate to="/onboarding" replace />;

  const profile = status?.onboarding;

  return (
    <>
      <PageMeta title="আমার ড্যাশবোর্ড · AgriSense" description="সহজ কৃষি পরামর্শ" />
      <section className="portal-intro">
        <div>
          <p className="portal-kicker">কৃষক ড্যাশবোর্ড</p>
          <h1 className="portal-title">স্বাগতম, {profile?.fullName || user.name} 🌾</h1>
          <p className="portal-lede">আপনার খামারের তথ্য অনুযায়ী সহজ ভাষায় পরামর্শ নিচে দেখুন।</p>
        </div>
        <span className="portal-status portal-status--success">✓ প্রোফাইল সম্পূর্ণ</span>
      </section>

      {error ? <div className="portal-alert portal-alert--error">{error}</div> : null}

      <Advisor profile={profile ?? null} />

      <section className="portal-workbench" aria-labelledby="farm-profile-title">
        <div className="portal-section-heading">
          <div>
            <h2 id="farm-profile-title">আপনার খামার</h2>
            <p>{profile?.filledBy === "tenant" ? "একজন টেন্যান্ট আপনার হয়ে তথ্য দিয়েছেন।" : "আপনি নিজে তথ্য দিয়েছেন।"}</p>
          </div>
          <Link to="/onboarding?edit=1" className="portal-button portal-button--quiet">তথ্য বদলান</Link>
        </div>
        <dl className="portal-profile-grid">
          <ProfileItem label="জেলা" value={profile?.district} />
          <ProfileItem label="জমি" value={profile?.farmSizeDecimals != null ? `${profile.farmSizeDecimals} শতক` : undefined} />
          <ProfileItem label="মাটি" value={profile?.soilTexture ? SOIL[profile.soilTexture] ?? profile.soilTexture : undefined} />
          <ProfileItem label="সেচ" value={profile?.waterAvailability ? WATER[profile.waterAvailability] ?? profile.waterAvailability : undefined} />
          <ProfileItem label="বাজেট" value={profile?.budgetBdt != null ? taka(profile.budgetBdt) : undefined} />
          <ProfileItem label="মৌসুম" value={profile?.targetSeason ? SEASON[profile.targetSeason] ?? profile.targetSeason : undefined} />
        </dl>
      </section>
    </>
  );
}

function Advisor({ profile }: { profile: OnboardingMe["onboarding"] }) {
  const [result, setResult] = useState<AgriSenseMessageResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");

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
    return `${parts.join(", ")}। আমার জন্য সবচেয়ে লাভজনক ফসল কোনটি এবং কেন?`;
  }, [profile]);

  async function ask(message: string) {
    if (!message.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await sendAgriSenseMessage({ message, preferredLanguage: "bn" });
      setResult(res);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "পরামর্শ তৈরি করা যায়নি। একটু পরে আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  function onAsk(event: FormEvent) {
    event.preventDefault();
    void ask(question);
  }

  const crops = (result?.cropRankings ?? []).slice(0, 3);
  const top = crops[0];

  return (
    <section className="portal-workbench" aria-labelledby="advisor-title">
      <div className="portal-section-heading">
        <div>
          <h2 id="advisor-title">আজকের পরামর্শ</h2>
          <p>এক চাপে জেনে নিন আপনার জমিতে কোন ফসল ভালো হবে।</p>
        </div>
      </div>

      {!result && (
        <button type="button" onClick={() => void ask(profileMessage)} disabled={busy} className="portal-button portal-button--primary w-full text-base">
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

      {crops.length > 1 && (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">অন্য ভালো ফসল</p>
          <div className="space-y-2">
            {crops.slice(1).map((c: CropRecommendation) => (
              <div key={c.crop} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-2.5 text-sm dark:border-gray-800">
                <span className="font-medium text-gray-800 dark:text-gray-100">{cropBn(c.crop)}</span>
                <span className="text-gray-500 dark:text-gray-400">সম্ভাব্য লাভ {taka(c.netProfitBdt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result?.seasonPlan?.tasks?.length ? (
        <div className="mt-4">
          <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">প্রথম কয়েকটি কাজ</p>
          <ol className="space-y-2">
            {result.seasonPlan.tasks.slice(0, 4).map((t, i) => (
              <li key={i} className="flex gap-3 rounded-xl border border-gray-200 p-3 text-sm dark:border-gray-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{i + 1}</span>
                <span>
                  <span className="font-medium text-gray-800 dark:text-gray-100">{t.title}</span>
                  {t.startDate ? <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">({t.startDate})</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Plain-language question box */}
      <form onSubmit={onAsk} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="যেকোনো প্রশ্ন লিখুন — যেমন: সার কখন দেব?"
        />
        <button type="submit" disabled={busy || !question.trim()} className="portal-button portal-button--quiet whitespace-nowrap">
          {busy ? "…" : "প্রশ্ন করুন"}
        </button>
      </form>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 p-3 text-center dark:bg-white/[0.04]">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-base font-bold text-gray-800 dark:text-gray-100">{value}</p>
    </div>
  );
}

function ProfileItem({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}
