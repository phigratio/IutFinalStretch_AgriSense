import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { transcribeSpeechmatics } from "../../api/voice.js";
import { saveOwnProfile, type OnboardingProfile } from "../../api/onboarding.js";

/**
 * Conversational self-onboarding, asked ONE field at a time with a tailored
 * placeholder (and quick-pick chips for the fixed choices). Deterministic and
 * offline-safe — no LLM call — so the farmer is never shown a wall of questions.
 * Chip values map to the canonical tokens the crop pipeline understands
 * (soil_fit_matrix.json + planningEngine normalizers); free-text steps keep the
 * Bengali voice input. Saves via saveOwnProfile → /user/dashboard.
 */

type Msg = { role: "bot" | "user"; text: string };
type Chip = { label: string; value: string };
type StepKind = "text" | "number" | "phone" | "chips";

interface Step {
  field: keyof CollectedProfile;
  kind: StepKind;
  question: string;
  placeholder?: string;
  chips?: Chip[];
  voice?: boolean;
}

interface CollectedProfile {
  fullName: string;
  district: string;
  farmSizeDecimals: string;
  soilTexture: string;
  waterAvailability: string;
  budgetBdt: string;
  targetSeason: string;
  phone: string;
}

const STEPS: Step[] = [
  { field: "fullName", kind: "text", voice: true, question: "শুরু করা যাক — আপনার নাম কী?", placeholder: "যেমন: রহিম উদ্দিন" },
  { field: "district", kind: "text", voice: true, question: "আপনার জমি কোন জেলায়?", placeholder: "যেমন: বগুড়া" },
  { field: "farmSizeDecimals", kind: "number", question: "কত জমি চাষ করবেন? (শতকে লিখুন)", placeholder: "যেমন: ২০০ শতক (১ একর = ১০০ শতক)" },
  {
    field: "soilTexture", kind: "chips", question: "আপনার জমির মাটির ধরন কী?",
    chips: [
      { label: "দোআঁশ", value: "loam" },
      { label: "এঁটেল", value: "clay" },
      { label: "বেলে/বালু", value: "sandy" },
      { label: "পলি", value: "silt" },
    ],
  },
  {
    field: "waterAvailability", kind: "chips", question: "সেচের ব্যবস্থা কেমন?",
    chips: [
      { label: "সেচ আছে (নলকূপ/খাল)", value: "tubewell irrigation" },
      { label: "সীমিত সেচ", value: "limited irrigation" },
      { label: "শুধু বৃষ্টিনির্ভর", value: "rainfed" },
    ],
  },
  { field: "budgetBdt", kind: "number", question: "এই মৌসুমের জন্য আপনার বাজেট কত? (টাকায়)", placeholder: "যেমন: ২০০০০ টাকা" },
  {
    field: "targetSeason", kind: "chips", question: "কোন মৌসুমে চাষ করতে চান?",
    chips: [
      { label: "রবি (শীত)", value: "rabi" },
      { label: "খরিফ-১ (আউশ)", value: "kharif-1" },
      { label: "আমন (বর্ষা)", value: "aman" },
      { label: "বোরো", value: "boro" },
    ],
  },
  { field: "phone", kind: "phone", question: "শেষ ধাপ — আপনার মোবাইল নম্বরটি লিখুন (এসএমএস সতর্কতার জন্য)।", placeholder: "017XXXXXXXX" },
];

const WELCOME = "স্বাগতম! আমি কয়েকটি সহজ প্রশ্ন একে একে জিজ্ঞেস করব — উত্তর দিলেই আপনার খামারের পরিকল্পনা তৈরি হয়ে যাবে।";

/** Bengali digits → ASCII, so "২০০" parses as 200. */
function toEnglishDigits(value: string): string {
  return value.replace(/[০-৯]/g, (d) => "০১২৩৪৫৬৭৮৯".indexOf(d).toString());
}

function parseNumber(value: string): number {
  return Number(toEnglishDigits(value).replace(/[^\d.]/g, ""));
}

function looksLikeMobile(value: string): boolean {
  const digits = toEnglishDigits(value).replace(/\D/g, "");
  return digits.length >= 11 && digits.includes("01");
}

export default function SelfOnboardChat() {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<keyof CollectedProfile, { value: string; label: string }>>>({});
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // --- Voice (Speechmatics, Bengali) — kept for the free-text steps ---
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const step: Step | undefined = STEPS[stepIndex];
  const done = stepIndex >= STEPS.length;

  // Build the transcript deterministically from what's been answered so far,
  // so Back simply pops the last step with no message bookkeeping.
  const messages: Msg[] = [{ role: "bot", text: WELCOME }];
  for (let i = 0; i < stepIndex; i++) {
    const s = STEPS[i];
    messages.push({ role: "bot", text: s.question });
    const a = answers[s.field];
    if (a) messages.push({ role: "user", text: a.label });
  }
  if (step) messages.push({ role: "bot", text: step.question });

  useEffect(() => {
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }, [stepIndex]);

  async function toggleMic() {
    if (recording) { recorderRef.current?.stop(); return; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        if (blob.size < 800) return; // too short / silent
        setTranscribing(true);
        try {
          const { transcript } = await transcribeSpeechmatics(blob, "bn");
          if (transcript.trim()) setInput((cur) => (cur ? `${cur} ${transcript.trim()}` : transcript.trim()));
          else setError("কিছু শোনা যায়নি। আবার বলুন।");
        } catch (e) {
          setError(e instanceof Error ? e.message : "ভয়েস রূপান্তর করা যায়নি।");
        } finally {
          setTranscribing(false);
        }
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("মাইক্রোফোন চালু করা যায়নি। অনুমতি দিন।");
    }
  }

  async function commit(next: Partial<Record<keyof CollectedProfile, { value: string; label: string }>>) {
    if (stepIndex + 1 < STEPS.length) {
      setStepIndex((i) => i + 1);
      return;
    }
    // Last step answered — persist the full profile.
    setStepIndex(STEPS.length);
    setSaving(true);
    setError(null);
    const g = (f: keyof CollectedProfile) => next[f]?.value ?? answers[f]?.value ?? "";
    const profile: OnboardingProfile = {
      district: g("district").trim() || "অজানা",
      fullName: g("fullName").trim() || undefined,
      phone: toEnglishDigits(g("phone")).replace(/\s/g, ""),
      farmSizeDecimals: Math.round(parseNumber(g("farmSizeDecimals"))) || undefined,
      soilTexture: g("soilTexture") || undefined,
      waterAvailability: g("waterAvailability") || undefined,
      budgetBdt: Math.round(parseNumber(g("budgetBdt"))),
      targetSeason: g("targetSeason") || undefined,
    };
    try {
      await saveOwnProfile(profile);
      setTimeout(() => navigate("/user/dashboard"), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "সংরক্ষণ করা যায়নি।");
      setSaving(false);
      setStepIndex(STEPS.length - 1); // let them retry the last step
    }
  }

  function answer(value: string, label: string) {
    if (!step) return;
    const next = { ...answers, [step.field]: { value, label } };
    setAnswers(next);
    setInput("");
    void commit(next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!step || saving) return;
    const text = input.trim();
    if (!text) return;

    if (step.kind === "number") {
      const n = parseNumber(text);
      if (!Number.isFinite(n) || n <= 0) { setError("দয়া করে একটি সংখ্যা লিখুন।"); return; }
    }
    if (step.kind === "phone" && !looksLikeMobile(text)) {
      setError("সঠিক মোবাইল নম্বর লিখুন (যেমন 017XXXXXXXX)।"); return;
    }
    setError(null);
    answer(text, text);
  }

  function goBack() {
    if (stepIndex === 0 || saving) return;
    const prev = STEPS[stepIndex - 1];
    setAnswers((a) => { const c = { ...a }; delete c[prev.field]; return c; });
    setInput("");
    setError(null);
    setStepIndex((i) => i - 1);
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-medium text-gray-500 dark:text-gray-400">
          {done ? "সম্পন্ন" : `ধাপ ${stepIndex + 1}/${STEPS.length}`}
        </span>
        {stepIndex > 0 && !done && (
          <button type="button" onClick={goBack} disabled={saving} className="font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50">
            ← আগের প্রশ্ন
          </button>
        )}
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/[0.06]">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(Math.min(stepIndex, STEPS.length) / STEPS.length) * 100}%` }} />
      </div>

      <div ref={scroller} className="mb-3 max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
              m.role === "user"
                ? "bg-brand-500 text-white"
                : "bg-gray-100 text-gray-800 dark:bg-white/[0.06] dark:text-gray-100"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {saving ? <div className="flex justify-start"><div className="rounded-2xl bg-gray-100 px-3.5 py-2 text-sm text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">সংরক্ষণ করছি…</div></div> : null}
      </div>

      {error ? <p className="mb-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      {step?.kind === "chips" ? (
        <div className="flex flex-wrap gap-2">
          {step.chips!.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => answer(c.value, c.label)}
              disabled={saving}
              className="rounded-full border border-brand-300 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-700 transition hover:bg-brand-100 disabled:opacity-50 dark:border-brand-700 dark:bg-brand-500/10 dark:text-brand-300 dark:hover:bg-brand-500/20"
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : step ? (
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          {step.voice && (
            <button
              type="button"
              onClick={() => void toggleMic()}
              disabled={saving || transcribing}
              title="বাংলায় বলুন"
              aria-label="ভয়েসে বলুন"
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-lg transition ${
                recording
                  ? "animate-pulse border-error-400 bg-error-50 text-error-600 dark:border-error-500/40 dark:bg-error-500/10"
                  : "border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              } disabled:opacity-50`}
            >
              {transcribing ? "…" : recording ? "⏹️" : "🎤"}
            </button>
          )}
          <input
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode={step.kind === "number" || step.kind === "phone" ? "numeric" : "text"}
            placeholder={transcribing ? "শোনা হচ্ছে…" : recording ? "রেকর্ড হচ্ছে… শেষে ⏹️ চাপুন" : step.placeholder}
            disabled={saving}
            autoFocus
          />
          <button type="submit" disabled={saving || !input.trim()} className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
            পাঠান
          </button>
        </form>
      ) : null}
    </div>
  );
}
