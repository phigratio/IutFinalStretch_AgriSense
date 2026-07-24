import { useCallback, useEffect, useState, type ReactNode } from "react";
import { fulfillAssistRequest, listAssistRequests, type AssistRequest, type OnboardingProfile } from "../api/onboarding.js";
import PageMeta from "../components/common/PageMeta.js";
import LocationAutofill, { EditableDistrictSelect } from "../components/onboarding/LocationAutofill.js";
import TenantKnowledgeUploader from "../components/tenant/TenantKnowledgeUploader.js";

const SOILS = [{ v: "sandy", bn: "বেলে" }, { v: "loam", bn: "দোআঁশ" }, { v: "clay", bn: "এঁটেল" }, { v: "silt", bn: "পলি" }];
const WATERS = [{ v: "rainfed", bn: "বৃষ্টিনির্ভর" }, { v: "limited_irrigation", bn: "সীমিত সেচ" }, { v: "reliable_irrigation", bn: "নিশ্চিত সেচ" }];
const SEASONS = [{ v: "kharif1", bn: "আউশ" }, { v: "kharif2_aman", bn: "আমন" }, { v: "rabi", bn: "রবি" }, { v: "boro", bn: "বোরো" }];

export default function TenantDashboard() {
  const [requests, setRequests] = useState<AssistRequest[]>([]);
  const [selected, setSelected] = useState<AssistRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setRequests(await listAssistRequests()); }
    catch (err) { setError(err instanceof Error ? err.message : "অনুরোধগুলো লোড করা যায়নি"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <>
      <PageMeta title="টেন্যান্ট ড্যাশবোর্ড · AgriSense" description="কৃষকের প্রোফাইল সহায়তা অনুরোধ" />
      <section className="portal-intro">
        <div>
          <p className="portal-kicker">টেন্যান্ট ড্যাশবোর্ড</p>
          <h1 className="portal-title">কৃষকের তথ্য সম্পূর্ণ করুন</h1>
          <p className="portal-lede">অ্যাডমিন আপনার আবেদন অনুমোদন করেছেন। এখন অপেক্ষমাণ কৃষকদের সম্পূর্ণ প্রোফাইল তৈরি করতে পারেন।</p>
        </div>
        <span className="portal-status">{requests.length.toLocaleString("bn-BD")}টি অপেক্ষমাণ</span>
      </section>

      {error ? <div className="portal-alert portal-alert--error">{error}</div> : null}

      <TenantKnowledgeUploader />

      <div className="portal-tenant-grid">
        <section className="portal-workbench" aria-labelledby="assist-title">
          <div className="portal-section-heading">
            <div><h2 id="assist-title">সহায়তার অনুরোধ</h2><p>একজন কৃষক নির্বাচন করে তার সব তথ্য পূরণ করুন।</p></div>
            <button type="button" className="portal-button portal-button--quiet" onClick={() => void refresh()} disabled={loading}>{loading ? "লোড হচ্ছে…" : "হালনাগাদ"}</button>
          </div>
          {loading ? <RequestSkeleton /> : requests.length === 0 ? (
            <div className="portal-empty"><span aria-hidden="true">✓</span><h3>কোনো অপেক্ষমাণ অনুরোধ নেই</h3><p>নতুন অনুরোধ এলে এখানে দেখা যাবে।</p></div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {requests.map((request) => (
                <button key={request.id} type="button" onClick={() => setSelected(request)} className={`portal-request-row ${selected?.id === request.id ? "is-selected" : ""}`}>
                  <span><strong>{request.fullName || "নাম দেওয়া হয়নি"}</strong><small>{request.district}{request.phone ? ` · ${request.phone}` : ""}</small></span>
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <section className="portal-workbench portal-workbench--form" aria-live="polite">
          {selected ? <FulfillForm key={selected.id} request={selected} onDone={() => { setSelected(null); void refresh(); }} /> : (
            <div className="portal-empty"><span aria-hidden="true">↖</span><h3>একজন কৃষক নির্বাচন করুন</h3><p>নির্বাচনের পর পূর্ণ প্রোফাইল ফর্ম এখানে খুলবে।</p></div>
          )}
        </section>
      </div>
    </>
  );
}

function FulfillForm({ request, onDone }: { request: AssistRequest; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: request.fullName || "", phone: request.phone || "", district: request.district, upazila: request.upazila || "", farmSizeDecimals: "", soilTexture: "", waterAvailability: "", budgetBdt: "", targetSeason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const valid = Boolean(form.fullName.trim() && form.phone.trim() && form.district.trim() && form.farmSizeDecimals.trim() && form.soilTexture && form.waterAvailability && form.budgetBdt.trim() && form.targetSeason && Number(form.farmSizeDecimals) > 0 && Number(form.budgetBdt) >= 0);

  async function submit() {
    setBusy(true); setError(null);
    const body: OnboardingProfile = { district: form.district, upazila: form.upazila || undefined, fullName: form.fullName, phone: form.phone, farmSizeDecimals: Number(form.farmSizeDecimals), soilTexture: form.soilTexture, waterAvailability: form.waterAvailability, budgetBdt: Number(form.budgetBdt), targetSeason: form.targetSeason };
    try { await fulfillAssistRequest(request.id, body); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "প্রোফাইল সংরক্ষণ করা যায়নি"); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="portal-section-heading"><div><h2>{request.fullName || "কৃষকের প্রোফাইল"}</h2><p>{request.district} · সব ঘর পূরণ করা আবশ্যক</p></div></div>
      {error ? <div className="portal-alert portal-alert--error">{error}</div> : null}
      <LocationAutofill className="px-6 pt-5" onDetected={(found) => setForm((old) => ({ ...old, district: found.district, upazila: found.upazila ?? "" }))} />
      <div className="portal-form-grid">
        <PortalField label="পূর্ণ নাম"><input value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required /></PortalField>
        <PortalField label="মোবাইল নম্বর"><input value={form.phone} onChange={(e) => update("phone", e.target.value)} required /></PortalField>
        <PortalField label="জেলা (পরিবর্তনযোগ্য)"><EditableDistrictSelect className="" value={form.district} onChange={(value) => update("district", value)} /></PortalField>
        <PortalField label="উপজেলা (পরিবর্তনযোগ্য)"><input value={form.upazila} onChange={(e) => update("upazila", e.target.value)} /></PortalField>
        <PortalField label="জমির পরিমাণ (শতক)"><input type="number" min="1" value={form.farmSizeDecimals} onChange={(e) => update("farmSizeDecimals", e.target.value)} required /></PortalField>
        <PortalField label="মাটির ধরন"><select value={form.soilTexture} onChange={(e) => update("soilTexture", e.target.value)} required><option value="">নির্বাচন করুন</option>{SOILS.map((x) => <option key={x.v} value={x.v}>{x.bn}</option>)}</select></PortalField>
        <PortalField label="সেচ সুবিধা"><select value={form.waterAvailability} onChange={(e) => update("waterAvailability", e.target.value)} required><option value="">নির্বাচন করুন</option>{WATERS.map((x) => <option key={x.v} value={x.v}>{x.bn}</option>)}</select></PortalField>
        <PortalField label="বাজেট (টাকা)"><input type="number" min="0" value={form.budgetBdt} onChange={(e) => update("budgetBdt", e.target.value)} required /></PortalField>
        <PortalField label="মৌসুম"><select value={form.targetSeason} onChange={(e) => update("targetSeason", e.target.value)} required><option value="">নির্বাচন করুন</option>{SEASONS.map((x) => <option key={x.v} value={x.v}>{x.bn}</option>)}</select></PortalField>
      </div>
      <button type="button" onClick={() => void submit()} disabled={!valid || busy} className="portal-button portal-button--primary mt-5 w-full">{busy ? "সংরক্ষণ হচ্ছে…" : "প্রোফাইল সম্পূর্ণ করুন"}</button>
    </div>
  );
}

function PortalField({ label, children }: { label: string; children: ReactNode }) { return <label className="portal-field"><span>{label}</span>{children}</label>; }
function RequestSkeleton() { return <div className="space-y-3 p-5" aria-label="লোড হচ্ছে"><div className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /><div className="h-14 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" /></div>; }
