import { useEffect, useState, type FormEvent } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { useAuth } from "../context/AuthContext.js";
import {
  listTenantDocuments,
  postTenantDocument,
  postTenantPrice,
  searchKnowledgeBase,
  type KbDocumentRecord,
  type KbHit,
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
  const [tenantId, setTenantId] = useState("dist-kushtia");
  const [status, setStatus] = useState("");
  const [documents, setDocuments] = useState<KbDocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [query, setQuery] = useState("");
  const [queryCropId, setQueryCropId] = useState("");
  const [includeUnverified, setIncludeUnverified] = useState(true);
  const [hits, setHits] = useState<KbHit[]>([]);
  const [resolvedTenantId, setResolvedTenantId] = useState(tenantId);
  const [searching, setSearching] = useState(false);

  async function loadDocuments() {
    if (!user?.id || !tenantId.trim()) return;
    setLoadingDocs(true);
    try {
      setDocuments(await listTenantDocuments(tenantId.trim(), user.id));
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setLoadingDocs(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [tenantId, user?.id]);

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

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;
    setStatus("Adding advisory to the tenant knowledge base…");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await postTenantDocument(tenantId.trim(), user.id, {
        docKey: data.get("docKey"),
        docType: data.get("docType"),
        cropId: data.get("cropId"),
        source: data.get("source"),
        text: data.get("text"),
      });
      setStatus("Advisory added. It is marked unverified until reviewed, so keep ‘Include draft entries’ on while testing it.");
      form.reset();
      await loadDocuments();
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  async function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user?.id) return;
    setStatus("Saving local market price…");
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await postTenantPrice(tenantId.trim(), user.id, {
        cropId: data.get("cropId"),
        district: data.get("district"),
        market: data.get("market"),
        price: Number(data.get("price")),
        unit: "kg",
        priceType: "retail",
        observedAt: data.get("observedAt"),
      });
      setStatus("Local market price saved.");
      form.reset();
    } catch (error) {
      setStatus((error as Error).message);
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

    <section className={`${card} mb-6`}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <label className={label}>Which KB should I use?</label>
          <input className={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Example: dist-kushtia" />
          <p className={help}>Use a tenant slug such as <strong>dist-kushtia</strong>. The search checks this tenant plus the shared hub knowledge.</p>
        </div>
        <button className={secondaryButton} type="button" disabled={loadingDocs} onClick={() => void loadDocuments()}>
          {loadingDocs ? "Refreshing…" : "Refresh document list"}
        </button>
      </div>
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

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className={card}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className={heading}>Source documents</h2>
            <p className={muted}>These are the document records registered for the selected tenant.</p>
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
              {!documents.length && <tr><td className={`${muted} py-6`} colSpan={4}>No documents found for this tenant yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="space-y-6">
        <details className={card} open>
          <summary className="cursor-pointer list-none">
            <h2 className={heading}>Add a local advisory</h2>
            <p className={`${muted} mt-1`}>Use this for actual written guidance, notices, pest alerts, or fertilizer advice.</p>
          </summary>
          <form className="mt-5 grid gap-3" onSubmit={submitDocument}>
            <div>
              <label className={label}>Document ID</label>
              <input className={input} name="docKey" placeholder="Example: kushtia-potato-blight-2026" required />
              <p className={help}>A stable unique key for this advisory.</p>
            </div>
            <div>
              <label className={label}>Crop, optional</label>
              <input className={input} name="cropId" placeholder="Example: potato" />
            </div>
            <div>
              <label className={label}>Type</label>
              <input className={input} name="docType" placeholder="advisory" defaultValue="advisory" required />
            </div>
            <div>
              <label className={label}>Source</label>
              <input className={input} name="source" placeholder="Example: Kushtia District Agriculture Office" required />
            </div>
            <div>
              <label className={label}>Advisory text</label>
              <textarea className={`${input} min-h-36`} name="text" placeholder="Paste the advisory or guidance text here…" required />
            </div>
            <button className={button} type="submit">Add advisory to KB</button>
          </form>
        </details>

        <details className={card}>
          <summary className="cursor-pointer list-none">
            <h2 className={heading}>Add a local market price</h2>
            <p className={`${muted} mt-1`}>Prices are used by planning/finance logic. They are not searchable advisory text.</p>
          </summary>
          <form className="mt-5 grid gap-3" onSubmit={submitPrice}>
            <div>
              <label className={label}>Crop</label>
              <input className={input} name="cropId" placeholder="Example: potato" required />
            </div>
            <div>
              <label className={label}>District</label>
              <input className={input} name="district" placeholder="Example: Kushtia" required />
            </div>
            <div>
              <label className={label}>Market, optional</label>
              <input className={input} name="market" placeholder="Example: Kushtia Sadar" />
            </div>
            <div>
              <label className={label}>Retail price, BDT per kg</label>
              <input className={input} name="price" type="number" min="0.01" step="0.01" placeholder="Example: 32" required />
            </div>
            <div>
              <label className={label}>Observed date</label>
              <input className={input} name="observedAt" type="date" required />
            </div>
            <button className={button} type="submit">Save market price</button>
          </form>
        </details>
      </aside>
    </div>
  </>;
}
