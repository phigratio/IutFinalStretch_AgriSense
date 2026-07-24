import { useCallback, useEffect, useState } from "react";
import { approveTenantRequest, listTenantRequests, rejectTenantRequest, type TenantRequest } from "../api/onboarding.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import PageMeta from "../components/common/PageMeta.js";

export default function TenantRequests() {
  const [requests, setRequests] = useState<TenantRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => { setLoading(true); try { setRequests(await listTenantRequests()); setError(null); } catch (err) { setError(err instanceof Error ? err.message : "Failed to load tenant requests"); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  async function decide(request: TenantRequest, decision: "approve" | "reject") {
    setBusyId(request.id); setError(null);
    try { decision === "approve" ? await approveTenantRequest(request.id) : await rejectTenantRequest(request.id); setRequests((old) => old.filter((item) => item.id !== request.id)); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update tenant request"); }
    finally { setBusyId(null); }
  }

  return <>
    <PageMeta title="Onboarding requests · ICT Fest Admin" description="Approve or reject tenant access" />
    <PageBreadcrumb pageTitle="Onboarding requests" />
    {error ? <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600">{error}</div> : null}
    <section className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <header className="border-b border-gray-200 p-5 dark:border-gray-800"><h2 className="text-lg font-semibold">Pending tenant requests</h2><p className="mt-1 text-sm text-gray-500">Approval grants the tenant dashboard and farmer-assistance queue.</p></header>
      {loading ? <p className="p-8 text-center text-gray-500">Loading…</p> : requests.length === 0 ? <p className="p-8 text-center text-gray-500">No pending tenant requests.</p> : <div className="divide-y divide-gray-200 dark:divide-gray-800">{requests.map((request) => <article key={request.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"><div><h3 className="font-semibold text-gray-800 dark:text-white/90">{request.orgName}</h3><p className="mt-1 text-sm text-gray-500">{request.district}{request.upazila ? ` · ${request.upazila}` : ""}</p>{request.note ? <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{request.note}</p> : null}</div><div className="flex gap-2"><button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "reject")} className="h-11 whitespace-nowrap rounded-lg border border-gray-300 px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800">Reject</button><button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "approve")} className="h-11 whitespace-nowrap rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50">{busyId === request.id ? "Saving…" : "Approve tenant"}</button></div></article>)}</div>}
    </section>
  </>;
}
