import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { getOnboardingMe, type OnboardingMe } from "../api/onboarding.js";
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
    </>
  );
}

function ProfileItem({ label, value }: { label: string; value?: string }) {
  return <div><dt>{label}</dt><dd>{value || "—"}</dd></div>;
}
