import { useState, type FormEvent } from "react";
import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { useAuth } from "../context/AuthContext.js";
import { postTenantDocument, postTenantPrice } from "../api/kb.js";

const input = "w-full rounded-lg border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-500 dark:border-gray-700 dark:text-white";
const card = "rounded-2xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]";

export default function KnowledgeBase() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState("dist-kushtia");
  const [status, setStatus] = useState("");

  async function submitPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("Saving price…");
    const data = new FormData(event.currentTarget);
    try {
      await postTenantPrice(tenantId, user!.id, { cropId: data.get("cropId"), district: data.get("district"), market: data.get("market"), price: Number(data.get("price")), unit: "kg", priceType: "retail", observedAt: data.get("observedAt") });
      setStatus("Local price saved."); event.currentTarget.reset();
    } catch (error) { setStatus((error as Error).message); }
  }

  async function submitDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setStatus("Sending document to the tenant KB…");
    const data = new FormData(event.currentTarget);
    try {
      await postTenantDocument(tenantId, user!.id, { docKey: data.get("docKey"), docType: data.get("docType"), cropId: data.get("cropId"), source: data.get("source"), text: data.get("text") });
      setStatus("Tenant document ingested."); event.currentTarget.reset();
    } catch (error) { setStatus((error as Error).message); }
  }

  return <>
    <PageMeta title="Knowledge Base · AgriSense" description="Manage tenant knowledge" />
    <PageBreadcrumb pageTitle="Knowledge Base" />
    <div className="mb-5 max-w-md"><label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Tenant slug</label><input className={input} value={tenantId} onChange={(e) => setTenantId(e.target.value)} /></div>
    {status && <p className="mb-5 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{status}</p>}
    <div className="grid gap-6 xl:grid-cols-2">
      <form className={card} onSubmit={submitPrice}>
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">Post local market price</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} name="cropId" placeholder="Crop ID, e.g. potato" required />
          <input className={input} name="district" placeholder="District" required />
          <input className={input} name="market" placeholder="Market" />
          <input className={input} name="price" type="number" min="0.01" step="0.01" placeholder="BDT/kg" required />
          <input className={input} name="observedAt" type="date" required />
        </div>
        <button className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Save price</button>
      </form>
      <form className={card} onSubmit={submitDocument}>
        <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white">Add local advisory</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} name="docKey" placeholder="Stable document key" required />
          <input className={input} name="cropId" placeholder="Crop ID" />
          <input className={input} name="docType" placeholder="advisory" defaultValue="advisory" required />
          <input className={input} name="source" placeholder="Source/office" required />
          <textarea className={`${input} min-h-40 sm:col-span-2`} name="text" placeholder="Advisory text" required />
        </div>
        <button className="mt-4 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">Ingest document</button>
      </form>
    </div>
  </>;
}
