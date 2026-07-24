import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { runAgentIntake } from "../../api/agent.js";
import { transcribeSpeechmatics } from "../../api/voice.js";
import { saveOwnProfile, type OnboardingProfile } from "../../api/onboarding.js";
import type { IntakeProfile } from "../../api/agrisense.js";

type Msg = { role: "bot" | "user"; text: string };

const FIELD_BN: Record<string, string> = {
  location: "এলাকা", locationText: "এলাকা", district: "জেলা", size: "জমির পরিমাণ", sizeAcres: "জমির পরিমাণ",
  soilType: "মাটির ধরন", soil: "মাটির ধরন", waterAvailability: "সেচ", water: "সেচ",
  budgetBdt: "বাজেট", budget: "বাজেট", targetSeason: "মৌসুম", season: "মৌসুম", phone: "মোবাইল নম্বর",
};

function normalizeSoil(s?: string): string | undefined {
  if (!s) return undefined;
  const l = s.toLowerCase();
  if (l.includes("sand")) return "sandy";
  if (l.includes("loam") || l.includes("দোআঁশ")) return "loam";
  if (l.includes("clay") || l.includes("এঁটেল")) return "clay";
  if (l.includes("silt") || l.includes("পলি")) return "silt";
  return s;
}

/** Conversational self-onboarding: the AI asks until every field is gathered, then saves. */
export default function SelfOnboardChat() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([
    { role: "bot", text: "আপনার খামারের কথা বলুন — কোথায়, কত জমি, কী মাটি, সেচ আছে কি না, বাজেট কত, আর কোন মৌসুমে চাষ করতে চান? লিখতে পারেন, অথবা 🎤 চেপে বাংলায় বলতে পারেন।" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const sessionId = useRef<string | undefined>(undefined);
  const profile = useRef<IntakeProfile | null>(null);
  const awaitingPhone = useRef(false);
  const scroller = useRef<HTMLDivElement>(null);

  // --- Voice (Speechmatics, Bengali) ---
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

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

  function push(m: Msg) {
    setMessages((cur) => [...cur, m]);
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  }

  function mapProfile(p: IntakeProfile, phone: string): OnboardingProfile {
    return {
      district: (p.locationText || "").trim() || "অজানা",
      phone,
      fullName: p.farmerName || undefined,
      farmSizeDecimals: p.sizeAcres != null ? Math.round(p.sizeAcres * 100) : undefined,
      soilTexture: normalizeSoil(p.soilType),
      waterAvailability: p.waterAvailability || undefined,
      budgetBdt: p.budgetBdt != null ? Number(p.budgetBdt) : undefined,
      targetSeason: p.targetSeason || undefined,
    };
  }

  async function finish(phone: string) {
    if (!profile.current) return;
    setBusy(true);
    try {
      await saveOwnProfile(mapProfile(profile.current, phone));
      push({ role: "bot", text: "ধন্যবাদ! আপনার তথ্য সংরক্ষিত হয়েছে। ড্যাশবোর্ডে নিয়ে যাচ্ছি…" });
      setTimeout(() => navigate("/user/dashboard"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "সংরক্ষণ করা যায়নি।");
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    push({ role: "user", text });
    setInput("");

    // Final phone step (agent intake doesn't require a phone).
    if (awaitingPhone.current) {
      void finish(text);
      return;
    }

    setBusy(true); setError(null);
    try {
      const res = await runAgentIntake({ message: text, sessionId: sessionId.current, preferredLanguage: "bn" });
      sessionId.current = res.sessionId;
      profile.current = res.profile;
      setMissing(res.missingFields);
      push({ role: "bot", text: res.reply });
      if (res.intakeComplete) {
        const phone = res.profile.bdappsMobile?.trim();
        if (phone) {
          void finish(phone);
        } else {
          awaitingPhone.current = true;
          push({ role: "bot", text: "শেষ প্রশ্ন — আপনার মোবাইল নম্বরটি লিখুন (এসএমএস সতর্কতার জন্য)।" });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "উত্তর তৈরি করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      {missing.length > 0 && !awaitingPhone.current ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500 dark:text-gray-400">এখনো দরকার:</span>
          {missing.map((f) => (
            <span key={f} className="rounded-full bg-warning-50 px-2.5 py-1 font-medium text-warning-600 dark:bg-warning-500/15 dark:text-warning-400">{FIELD_BN[f] ?? f}</span>
          ))}
        </div>
      ) : null}

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
        {busy ? <div className="flex justify-start"><div className="rounded-2xl bg-gray-100 px-3.5 py-2 text-sm text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">লিখছে…</div></div> : null}
      </div>

      {error ? <p className="mb-2 text-sm text-error-600 dark:text-error-400">{error}</p> : null}

      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void toggleMic()}
          disabled={busy || transcribing}
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
        <input
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={transcribing ? "শোনা হচ্ছে…" : recording ? "রেকর্ড হচ্ছে… শেষে ⏹️ চাপুন" : awaitingPhone.current ? "017XXXXXXXX" : "লিখুন বা 🎤 চেপে বলুন"}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">
          পাঠান
        </button>
      </form>
    </div>
  );
}
