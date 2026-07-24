import { useEffect, useState, type FormEvent } from "react";
import { getTenantContext, searchKnowledgeBase, type KbHit, type TenantContext } from "../../api/kb.js";
import { useAuth } from "../../context/AuthContext.js";

const SCOPE_BN: Record<string, string> = { hub: "কেন্দ্রীয় ভাণ্ডার", tenant: "স্থানীয় (আপনার জেলা)" };
const VERIFY_BN: Record<string, string> = { verified: "যাচাইকৃত", cross_checked: "ক্রস-চেকড", unverified: "যাচাই হয়নি" };
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|gif|svg|avif)(\?|$)/i;

function isImageUrl(url?: string): boolean {
  return Boolean(url && IMAGE_EXTENSIONS.test(url));
}

/** Tenant-facing knowledge-base query. Every answer shows exactly where it came from. */
export default function TenantKnowledgeSearch() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<KbHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getTenantContext().then(setTenant).catch(() => undefined);
  }, []);

  async function run(event: FormEvent) {
    event.preventDefault();
    if (!tenant || !user?.id || !query.trim()) return;
    setBusy(true);
    setError(null);
    setHits(null);
    try {
      const result = await searchKnowledgeBase(tenant.slug, user.id, { query: query.trim() });
      setHits(result.hits);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "খোঁজা যায়নি। আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portal-workbench portal-kb" aria-labelledby="tenant-kb-search-title">
      <div className="portal-section-heading">
        <div>
          <h2 id="tenant-kb-search-title">জ্ঞানভাণ্ডারে খুঁজুন</h2>
          <p>প্রশ্ন লিখুন — উত্তরের সাথে ঠিক কোথা থেকে তথ্য এসেছে তা দেখানো হবে।</p>
        </div>
      </div>

      <form onSubmit={run} className="flex flex-col gap-3 sm:flex-row">
        <input
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="যেমন: আমন ধানে ইউরিয়া কখন দেব?"
        />
        <button type="submit" disabled={busy || !query.trim()} className="portal-button portal-button--primary whitespace-nowrap">
          {busy ? "খুঁজছি…" : "খুঁজুন"}
        </button>
      </form>

      {error ? <p className="portal-inline-message portal-inline-message--error" role="alert">{error}</p> : null}

      {hits !== null && (
        <div className="mt-4 space-y-4">
          {hits.length === 0 ? (
            <div className="portal-empty"><span aria-hidden="true">🔍</span><h3>কোনো তথ্য পাওয়া যায়নি</h3><p>অন্য শব্দে খুঁজে দেখুন।</p></div>
          ) : (
            hits.map((hit, i) => <HitCard key={`${hit.docKey ?? "hit"}-${i}`} hit={hit} />)
          )}
        </div>
      )}
    </section>
  );
}

function HitCard({ hit }: { hit: KbHit }) {
  const previewUrl = hit.imageUrl ?? (isImageUrl(hit.sourceUrl) ? hit.sourceUrl : undefined);

  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Provenance chips — "exactly where the info came from" */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">{hit.citation}</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{SCOPE_BN[hit.scope ?? "hub"]}</span>
        {hit.docType ? <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{hit.docType}</span> : null}
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">{VERIFY_BN[hit.verificationStatus]}</span>
      </div>

      {hit.title ? <div className="mb-1 text-sm font-semibold text-gray-800 dark:text-gray-100">{hit.title}</div> : null}
      <p className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-100">{hit.text}</p>

      {previewUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <img
            src={previewUrl}
            alt={hit.title ? `${hit.title} ছবি` : "তথ্যচিত্র"}
            className="max-h-56 w-full object-contain"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        {hit.source ? <span>উৎস: <span className="font-medium text-gray-700 dark:text-gray-300">{hit.source}</span></span> : null}
        {hit.page ? <span>পৃষ্ঠা: <span className="font-medium text-gray-700 dark:text-gray-300">{hit.page}</span></span> : null}
        {hit.sourceUrl ? (
          <a href={hit.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-brand-600 underline dark:text-brand-300">
            উৎস দেখুন ↗
          </a>
        ) : null}
      </div>
    </article>
  );
}
