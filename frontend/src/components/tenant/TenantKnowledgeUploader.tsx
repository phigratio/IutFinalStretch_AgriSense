import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { addTenantKbLink, getTenantContext, listTenantKbJobs, uploadTenantKbFile, uploadTenantKbImage, postTenantDocument, type KbIngestionJob, type TenantContext } from "../../api/kb.js";
import { useAuth } from "../../context/AuthContext.js";

type Choice = "advisory" | "photo" | "pdf" | "link";

export default function TenantKnowledgeUploader() {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [choice, setChoice] = useState<Choice>("advisory");
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [jobs, setJobs] = useState<KbIngestionJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getTenantContext().then(setTenant).catch((reason) => setError(reason instanceof Error ? reason.message : "টেন্যান্টের তথ্য পাওয়া যায়নি"));
  }, []);

  useEffect(() => {
    if (!tenant || !user?.id) return;
    const refresh = () => listTenantKbJobs(tenant.slug, user.id).then(setJobs).catch(() => undefined);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [tenant, user?.id]);

  function select(next: Choice) {
    setChoice(next); setFile(null); setMessage(null); setError(null);
  }

  async function submitAdvisory() {
    if (!tenant || !user?.id) return;
    let imageUrl: string | undefined;
    if (file) imageUrl = (await uploadTenantKbImage(tenant.slug, user.id, file)).imageUrl;
    await postTenantDocument(tenant.slug, user.id, {
      text: text.trim(),
      docKey: `advisory:${Date.now()}`,
      docType: "advisory",
      title: title.trim() || undefined,
      source: `${tenant.jurisdictions[0]?.district ?? tenant.name} জেলা`,
      sourceUrl: url.trim() || undefined,
      imageUrl,
    });
    setMessage("পরামর্শ জ্ঞানভাণ্ডারে যোগ হয়েছে।");
    setText(""); setUrl(""); setTitle(""); setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null);
    setMessage(null); setError(null);
  }

  async function submit() {
    if (!tenant || !user?.id) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      if (choice === "advisory") {
        await submitAdvisory();
      } else if (choice === "link") {
        const result = await addTenantKbLink(tenant.slug, user.id, { url: url.trim(), title: title.trim() || undefined });
        setMessage(`“${result.title}” জ্ঞানভাণ্ডারে যোগ হয়েছে।`);
        setUrl(""); setTitle("");
      } else if (file) {
        const data = new FormData();
        data.set("file", file);
        data.set("title", title.trim() || file.name);
        data.set("source", `${tenant.jurisdictions[0]?.district ?? tenant.name} জেলা`);
        data.set("docType", choice === "photo" ? "field_photo" : "reference");
        data.set("verificationStatus", "unverified");
        const job = await uploadTenantKbFile(tenant.slug, user.id, data);
        setJobs((current) => [job, ...current]);
        setMessage("ফাইল গ্রহণ করা হয়েছে। লেখা পড়ে জ্ঞানভাণ্ডারে যোগ করা হচ্ছে।");
        setFile(null); setTitle("");
        if (fileRef.current) fileRef.current.value = "";
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "যোগ করা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  const district = tenant?.jurisdictions[0]?.district;
  const canSubmit = Boolean(
    tenant && user?.id && (choice === "link" ? url.trim() : choice === "advisory" ? text.trim() : file),
  );
  const latestJob = jobs[0];

  return (
    <section className="portal-workbench portal-kb" aria-labelledby="tenant-kb-title">
      <div className="portal-section-heading">
        <div>
          <h2 id="tenant-kb-title">জ্ঞানভাণ্ডার আপডেট করুন</h2>
          <p>{district ? `${district} জেলার কৃষকদের জন্য` : "আপনার জেলার কৃষকদের জন্য"} ছবি, PDF বা নির্ভরযোগ্য লিংক যোগ করুন।</p>
        </div>
        {district ? <span className="portal-district">{district} জেলা</span> : null}
      </div>

      <div className="portal-kb-body">
        <div className="portal-choice-group" aria-label="কী যোগ করবেন">
          <button type="button" className={choice === "advisory" ? "is-selected" : ""} aria-pressed={choice === "advisory"} onClick={() => select("advisory")}><span aria-hidden="true">✎</span> পরামর্শ</button>
          <button type="button" className={choice === "photo" ? "is-selected" : ""} aria-pressed={choice === "photo"} onClick={() => select("photo")}><span aria-hidden="true">▧</span> ছবি</button>
          <button type="button" className={choice === "pdf" ? "is-selected" : ""} aria-pressed={choice === "pdf"} onClick={() => select("pdf")}><span aria-hidden="true">▤</span> PDF</button>
          <button type="button" className={choice === "link" ? "is-selected" : ""} aria-pressed={choice === "link"} onClick={() => select("link")}><span aria-hidden="true">↗</span> লিংক</button>
        </div>

        <div className="portal-kb-fields">
          {choice === "advisory" ? (
            <>
              <label className="portal-field"><span>পরামর্শ লিখুন</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder="যেমন: আমন ধানে খোল পচা রোগ হলে সেচ কমিয়ে দিন এবং…" /></label>
              <label className="portal-file-picker">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickFile} />
                <span>{file ? file.name : "ছবি যুক্ত করুন (ইচ্ছামতো)"}</span>
                <small>{file ? "অন্য ছবি নিতে এখানে চাপুন" : "কৃষককে দেখানোর জন্য একটি ছবি"}</small>
              </label>
              <label className="portal-field"><span>উৎস লিংক (ইচ্ছামতো)</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" /></label>
            </>
          ) : choice === "link" ? (
            <label className="portal-field"><span>ওয়েব লিংক</span><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" required /></label>
          ) : (
            <label className="portal-file-picker">
              <input ref={fileRef} type="file" accept={choice === "photo" ? "image/png,image/jpeg,image/webp,image/tiff" : "application/pdf,.pdf"} onChange={pickFile} />
              <span>{file ? file.name : choice === "photo" ? "ছবি বেছে নিন" : "PDF বেছে নিন"}</span>
              <small>{file ? "অন্য ফাইল নিতে এখানে চাপুন" : "সর্বোচ্চ ১০০ MB"}</small>
            </label>
          )}
          <label className="portal-field"><span>শিরোনাম (ইচ্ছামতো)</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="যেমন: আমন ধানের রোগ প্রতিরোধ" /></label>
        </div>

        {message ? <p className="portal-inline-message portal-inline-message--success" role="status">✓ {message}</p> : null}
        {error ? <p className="portal-inline-message portal-inline-message--error" role="alert">{error}</p> : null}

        <div className="portal-kb-action">
          <button type="button" className="portal-button portal-button--primary" disabled={!canSubmit || busy} onClick={() => void submit()}>{busy ? "যোগ হচ্ছে…" : "জ্ঞানভাণ্ডারে যোগ করুন"}</button>
          {latestJob ? <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            <p>সর্বশেষ: {latestJob.status === "completed" ? "যোগ হয়েছে" : latestJob.status === "failed" ? "যোগ করা যায়নি" : "প্রক্রিয়াধীন"}</p>
            {latestJob.status === "failed" && latestJob.errorMessage ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700 dark:bg-red-900/30 dark:text-red-200">কারণ: {latestJob.errorMessage}</p>
            ) : null}
            {latestJob.stage ? <p className="text-xs text-gray-500 dark:text-gray-400">অবস্থা: {latestJob.stage}</p> : null}
          </div> : null}
        </div>
      </div>
    </section>
  );
}
