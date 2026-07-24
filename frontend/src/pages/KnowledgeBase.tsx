import { useEffect, useState, type FormEvent } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { useAuth } from "../context/AuthContext.js";
import {
  listHubDocuments,
  listKbIngestionJobs,
  retryKbIngestionJob,
  searchKnowledgeBase,
  uploadKbFiles,
  type KbDocumentRecord,
  type KbHit,
  type KbIngestionJob,
} from "../api/kb.js";

const input = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white";
const label = "mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300";
const help = "mt-1 text-xs text-gray-500 dark:text-gray-400";
const card = "rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]";
const muted = "text-sm text-gray-500 dark:text-gray-400";
const heading = "text-lg font-semibold text-gray-800 dark:text-white";
const button = "rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton = "rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-white/[0.04]";

export default function KnowledgeBase() {
  const { user } = useAuth();
  const tenantId = "hub";
  const [status, setStatus] = useState("");
  const [documents, setDocuments] = useState<KbDocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [query, setQuery] = useState("");
  const [queryCropId, setQueryCropId] = useState("");
  const [includeUnverified, setIncludeUnverified] = useState(true);
  const [hits, setHits] = useState<KbHit[]>([]);
  const [resolvedTenantId, setResolvedTenantId] = useState(tenantId);
  const [searching, setSearching] = useState(false);
  const [jobs, setJobs] = useState<KbIngestionJob[]>([]);
  const [uploading, setUploading] = useState(false);

  async function loadDocuments() {
    if (!user?.id || !tenantId.trim()) return;
    setLoadingDocs(true);
    try {
      setDocuments(await listHubDocuments());
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !tenantId.trim()) return;
    const load = async () => setJobs(await listKbIngestionJobs());
    void load().catch((error) => setStatus((error as Error).message));
    const interval = window.setInterval(() => void load().catch(() => undefined), 3000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setUploading(true);
    setStatus("Uploading file and creating a background ingestion job…");
    try {
      const result = await uploadKbFiles(data);
      setJobs((current) => [...result.jobs, ...current]);
      setStatus(`${result.jobs.length} file(s) accepted for background ingestion. You can leave this page.`);
      form.reset();
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function retryJob(job: KbIngestionJob) {
    setStatus(`Retrying ${job.originalName}…`);
    try {
      await retryKbIngestionJob(job.id);
      setJobs((current) => current.map((item) => item.id === job.id
        ? { ...item, status: "queued", stage: "queued", errorMessage: undefined, processedChunks: 0, chunkCount: 0 }
        : item));
      setStatus("Retry queued. Scanned-book OCR progress will update below.");
    } catch (error) { setStatus((error as Error).message); }
  }

  async function submitQuery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id || !query.trim()) return;
    setSearching(true);
    setStatus("Searching the knowledge base…");
    try {
      const result = await searchKnowledgeBase(tenantId.trim(), user.id, {
        query: query.trim(),
        cropId: queryCropId.trim() || undefined,
        includeUnverified,
      });
      setHits(result.hits);
      setResolvedTenantId(result.tenantId);
      setStatus(result.hits.length ? `Found ${result.hits.length} answer source(s).` : "No matching KB entries found.");
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return <>
    <PageMeta title="Knowledge Base · AgriSense" description="Search, review, and update agronomy knowledge" />
    <PageBreadcrumb pageTitle="Knowledge Base" />

    <div className="mb-6 rounded-2xl bg-gradient-to-r from-brand-500 to-brand-600 p-6 text-white">
      <p className="text-sm font-medium uppercase tracking-wide text-white/70">AgriSense admin</p>
      <h1 className="mt-2 text-2xl font-semibold">Search and manage the agronomy knowledge base</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/85">
        Ask the KB questions, review the source documents available to this tenant, and add local advisories or market prices.
      </p>
    </div>

    <section className={`${card} mb-6 flex items-center justify-between gap-4`}>
      <div><h2 className={heading}>Central knowledge hub</h2><p className={muted}>All uploads and searches use the single shared AgriSense knowledge base.</p></div>
      <button className={secondaryButton} type="button" disabled={loadingDocs} onClick={() => void loadDocuments()}>{loadingDocs ? "Refreshing…" : "Refresh"}</button>
    </section>

    {status && <p className="mb-5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{status}</p>}

    <section className={`${card} mb-6`}>
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className={heading}>Ask the knowledge base</h2>
          <p className={muted}>Use this to check whether your KB contains the answer and which source it came from.</p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
          Current KB: {tenantId.trim() || "not selected"}
        </span>
      </div>

      <form className="grid gap-4" onSubmit={submitQuery}>
        <div>
          <label className={label}>Question</label>
          <textarea
            className={`${input} min-h-28`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Example: What should a Kushtia farmer do for potato late blight?"
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div>
            <label className={label}>Crop filter, optional</label>
            <input className={input} value={queryCropId} onChange={(e) => setQueryCropId(e.target.value)} placeholder="Example: potato" />
            <p className={help}>Leave empty to search all crops.</p>
          </div>
          <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 dark:border-gray-800 dark:text-gray-300">
            <input type="checkbox" checked={includeUnverified} onChange={(e) => setIncludeUnverified(e.target.checked)} />
            Include draft entries
          </label>
        </div>
        <div>
          <button className={button} type="submit" disabled={searching}>{searching ? "Searching…" : "Search KB"}</button>
        </div>
      </form>

      <div className="mt-6 space-y-3">
        <p className={muted}>Resolved tenant: {resolvedTenantId}</p>
        {hits.map((hit) => <article className="rounded-xl border border-gray-200 p-4 dark:border-gray-800" key={`${hit.citation}:${hit.text.slice(0, 32)}`}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium text-brand-600 dark:text-brand-300">{hit.citation}</span>
            <span>score {hit.score.toFixed(3)}</span>
            <span>{hit.verificationStatus}</span>
            {hit.docKey && <span>{hit.docKey}</span>}
          </div>
          <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{hit.text}</p>
        </article>)}
        {!hits.length && <div className="rounded-xl border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
          <p className={muted}>Search results will appear here.</p>
        </div>}
      </div>
    </section>

    <section className={`${card} mb-6`}>
      <div className="mb-5">
        <h2 className={heading}>Upload documents and books</h2>
        <p className={muted}>Upload a PDF, image, DOCX, EPUB, or text file. Text extraction, OCR, chunking, and vector ingestion continue in the background.</p>
      </div>
      <form className="grid gap-4 lg:grid-cols-2" onSubmit={submitUpload}>
        <div className="lg:col-span-2">
          <label className={label}>File (maximum 100 MB)</label>
          <input className={input} name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.docx,.epub,.txt,.md,.csv" required />
          <p className={help}>Images are OCRed in Bangla and English. Searchable PDFs preserve page-level citations.</p>
        </div>
        <div><label className={label}>Title, optional</label><input className={input} name="title" placeholder="Defaults to the filename" /></div>
        <div><label className={label}>Source</label><input className={input} name="source" placeholder="Example: Bangladesh Rice Research Institute" required /></div>
        <div><label className={label}>Source URL, optional</label><input className={input} name="sourceUrl" type="url" placeholder="https://…" /></div>
        <div><label className={label}>Crop ID, optional</label><input className={input} name="cropId" placeholder="Example: rice_t_aman" /></div>
        <div><label className={label}>Document type</label><input className={input} name="docType" defaultValue="reference" /></div>
        <div>
          <label className={label}>Review status</label>
          <select className={input} name="verificationStatus" defaultValue="unverified">
            <option value="unverified">Unverified draft (safest)</option>
            <option value="cross_checked">Cross-checked</option>
            <option value="verified">Verified authoritative source</option>
          </select>
          <p className={help}>Drafts are visible to admins but excluded from farmer answers.</p>
        </div>
        <div className="lg:col-span-2"><button className={button} type="submit" disabled={uploading}>{uploading ? "Uploading…" : "Upload and ingest in background"}</button></div>
      </form>

      <div className="mt-7 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400"><tr>
            <th className="py-2 pr-4">File</th><th className="py-2 pr-4">Status</th><th className="py-2 pr-4">Progress</th><th className="py-2">Result</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {jobs.map((job) => <tr key={job.id}>
              <td className="py-3 pr-4"><div className="font-medium text-gray-800 dark:text-white">{job.title}</div><div className="text-xs text-gray-500">{job.originalName}</div></td>
              <td className="py-3 pr-4"><span className="rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-white/[0.06]">{job.status} · {job.stage}</span></td>
              <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{job.processedChunks}/{job.chunkCount || "?"} chunks</td>
              <td className="py-3 text-gray-600 dark:text-gray-300">{job.errorMessage ? <div><span className="text-error-500">{job.errorMessage}</span><button className="ml-3 text-sm font-medium text-brand-500" type="button" onClick={() => void retryJob(job)}>Retry</button></div> : job.status === "completed" ? `${job.extractedChars.toLocaleString()} characters` : "—"}</td>
            </tr>)}
            {!jobs.length && <tr><td className={`${muted} py-5`} colSpan={4}>No upload jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <section className={card}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className={heading}>Source documents</h2>
            <p className={muted}>These are the documents currently registered in the central hub.</p>
          </div>
          <button className="text-sm font-medium text-brand-500 hover:text-brand-600" type="button" onClick={() => void loadDocuments()}>
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs uppercase text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <tr>
                <th className="py-2 pr-4">Document</th>
                <th className="py-2 pr-4">Crop</th>
                <th className="py-2 pr-4">Review status</th>
                <th className="py-2 pr-4">Vector IDs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {documents.map((doc) => <tr key={`${doc.tenantId}:${doc.docKey}`}>
                <td className="py-3 pr-4 text-gray-800 dark:text-white">
                  <div className="font-medium">{doc.docKey}</div>
                  <div className="text-xs text-gray-500">{doc.source}{doc.page ? ` p.${doc.page}` : ""}</div>
                </td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{doc.cropId || "All"}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{doc.verificationStatus}</td>
                <td className="py-3 pr-4 text-gray-600 dark:text-gray-300">{doc.mem0Ids.length || "—"}</td>
              </tr>)}
              {!documents.length && <tr><td className={`${muted} py-6`} colSpan={4}>No central documents found yet.</td></tr>}
            </tbody>
          </table>
        </div>
    </section>
  </>;
}
