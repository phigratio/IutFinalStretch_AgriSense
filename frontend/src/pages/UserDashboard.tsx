import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getOnboardingMe, type OnboardingMe } from "../api/onboarding.js";
import { getChannelStatus, requestBdappsOtp, verifyPhone, type ChannelStatus } from "../api/channel.js";
import PageMeta from "../components/common/PageMeta.js";
import { PortalLoader } from "../components/common/DashboardLanding.js";
import { useAuth } from "../context/AuthContext.js";

const SOIL: Record<string, string> = { sandy: "বেলে", loam: "দোআঁশ", clay: "এঁটেল", silt: "পলি" };
const WATER: Record<string, string> = { rainfed: "বৃষ্টিনির্ভর", limited_irrigation: "সীমিত সেচ", reliable_irrigation: "নিশ্চিত সেচ" };
const SEASON: Record<string, string> = { kharif1: "আউশ", kharif2_aman: "আমন", rabi: "রবি", boro: "বোরো" };

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
      <PageMeta title="আমার ড্যাশবোর্ড · AgriSense" description="আপনার সম্পূর্ণ কৃষি প্রোফাইল" />
      <section className="portal-intro">
        <div>
          <p className="portal-kicker">কৃষক ড্যাশবোর্ড</p>
          <h1 className="portal-title">স্বাগতম, {profile?.fullName || user.name}</h1>
          <p className="portal-lede">আপনার খামারের তথ্য সম্পূর্ণ। এই তথ্য ব্যবহার করে AgriSense পরামর্শ ও পরিকল্পনা তৈরি করবে।</p>
        </div>
        <span className="portal-status portal-status--success">✓ প্রোফাইল সম্পূর্ণ</span>
      </section>

      {error ? <div className="portal-alert portal-alert--error">{error}</div> : null}

      <section className="portal-workbench" aria-labelledby="farm-profile-title">
        <div className="portal-section-heading">
          <div>
            <h2 id="farm-profile-title">আপনার খামার</h2>
            <p>{profile?.filledBy === "tenant" ? "একজন অনুমোদিত টেন্যান্ট আপনার হয়ে তথ্য পূরণ করেছেন।" : "আপনি নিজেই এই তথ্য পূরণ করেছেন।"}</p>
          </div>
          <Link to="/onboarding?edit=1" className="portal-button portal-button--quiet">তথ্য হালনাগাদ</Link>
        </div>
        <dl className="portal-profile-grid">
          <ProfileItem label="জেলা" value={profile?.district} />
          <ProfileItem label="মোবাইল" value={profile?.phone} />
          <ProfileItem label="জমির পরিমাণ" value={profile?.farmSizeDecimals != null ? `${profile.farmSizeDecimals} শতক` : undefined} />
          <ProfileItem label="মাটির ধরন" value={profile?.soilTexture ? SOIL[profile.soilTexture] || profile.soilTexture : undefined} />
          <ProfileItem label="সেচ সুবিধা" value={profile?.waterAvailability ? WATER[profile.waterAvailability] || profile.waterAvailability : undefined} />
          <ProfileItem label="বাজেট" value={profile?.budgetBdt != null ? `৳${profile.budgetBdt.toLocaleString("bn-BD")}` : undefined} />
          <ProfileItem label="মৌসুম" value={profile?.targetSeason ? SEASON[profile.targetSeason] || profile.targetSeason : undefined} />
          <ProfileItem label="তথ্য পূরণ করেছেন" value={profile?.filledBy === "tenant" ? "টেন্যান্ট" : "নিজে"} />
        </dl>
      </section>

      {profile?.phone ? <ChannelCard phone={profile.phone} /> : null}
    </>
  );
}

function ProfileItem({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}

/**
 * BDApps SMS-channel activation. A logged-in farmer verifies their phone (OTP)
 * so AgriSense can text weather/pest alerts. Activates the channel on THIS
 * account — no new login. See docs/plans/BDAPPS-INTEGRATION-PLAN.md §1a.
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
    setBusy(true);
    setMsg(null);
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
    setBusy(true);
    setMsg(null);
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
