import { useState } from "react";
import { getLocationDefaults } from "../../api/onboarding.js";

export const DISTRICTS = ["Kushtia", "Bogura", "Dhaka", "Rangpur", "Rajshahi", "Dinajpur", "Cumilla", "Jashore", "Mymensingh", "Barishal"];
export const DISTRICT_BN: Record<string, string> = {
  Kushtia: "কুষ্টিয়া", Bogura: "বগুড়া", Dhaka: "ঢাকা", Rangpur: "রংপুর", Rajshahi: "রাজশাহী",
  Dinajpur: "দিনাজপুর", Cumilla: "কুমিল্লা", Jashore: "যশোর", Mymensingh: "ময়মনসিংহ", Barishal: "বরিশাল",
};

interface Props {
  onDetected: (location: { district: string; upazila?: string }) => void;
  className?: string;
}

export default function LocationAutofill({ onDetected, className = "" }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  function detect() {
    if (!navigator.geolocation) {
      setState("error"); setMessage("এই ব্রাউজারে লোকেশন সুবিধা নেই।"); return;
    }
    setState("loading"); setMessage("লোকেশন খোঁজা হচ্ছে…");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const found = await getLocationDefaults(coords.latitude, coords.longitude);
          onDetected({ district: found.district, upazila: found.upazila });
          setState("success");
          setMessage(`${found.district}${found.upazila ? ` · ${found.upazila}` : ""} নির্বাচন করা হয়েছে। চাইলে পরিবর্তন করুন।`);
        } catch (err) {
          setState("error"); setMessage(err instanceof Error ? err.message : "লোকেশন থেকে জেলা পাওয়া যায়নি।");
        }
      },
      (error) => {
        setState("error");
        setMessage(error.code === error.PERMISSION_DENIED ? "লোকেশন অনুমতি দেওয়া হয়নি। জেলা নিজে নির্বাচন করুন।" : "বর্তমান লোকেশন পাওয়া যায়নি। জেলা নিজে নির্বাচন করুন।");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className={className}>
      <button type="button" onClick={detect} disabled={state === "loading"} className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg border border-brand-300 bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-brand-800 dark:bg-brand-500/10 dark:text-brand-300">
        {state === "loading" ? "লোকেশন খোঁজা হচ্ছে…" : "বর্তমান লোকেশন ব্যবহার করুন"}
      </button>
      {message ? <p role={state === "error" ? "alert" : "status"} className={`mt-1 text-sm ${state === "error" ? "text-error-600 dark:text-error-500" : "text-gray-500 dark:text-gray-400"}`}>{message}</p> : null}
    </div>
  );
}

export function EditableDistrictSelect({ value, onChange, className }: { value: string; onChange: (value: string) => void; className: string }) {
  const known = DISTRICTS.includes(value);
  return (
    <select className={className} value={known ? value : value ? "__detected" : ""} onChange={(event) => onChange(event.target.value === "__detected" ? value : event.target.value)}>
      <option value="">— জেলা নির্বাচন করুন —</option>
      {!known && value ? <option value="__detected">{value} (সনাক্ত করা)</option> : null}
      {DISTRICTS.map((district) => <option key={district} value={district}>{DISTRICT_BN[district]} ({district})</option>)}
    </select>
  );
}
