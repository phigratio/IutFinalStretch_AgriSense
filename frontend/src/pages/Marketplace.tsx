import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import {
  getMarketplaceIntelligence,
  getMarketplaceRun,
  listMarketplaceRuns,
  type MarketplaceIntelligenceResult,
  type MarketplaceRunRecord,
  type SupplierOffer,
} from "../api/marketplace.js";
import type { AgriSenseMessageResult, SeasonPlanTask } from "../api/agrisense.js";
import { checkoutPayment, type CheckoutResult } from "../api/payments.js";
import { BoxIcon, CreditCardIcon, ListIcon, SearchIcon } from "../icons/index.js";

/** Sandbox CaaS caps a debit at ৳100, so a large order pays a booking deposit. */
const DEPOSIT_CAP = 100;

const presets = [
  { label: "Urea in Gazipur", itemName: "Urea fertilizer", quantity: 120, unit: "kg", district: "Gazipur", crop: "rice" },
  { label: "TSP in Bogura", itemName: "TSP fertilizer", quantity: 80, unit: "kg", district: "Bogura", crop: "rice" },
  { label: "Maize seed", itemName: "Hybrid maize seed", quantity: 25, unit: "kg", district: "Gazipur", crop: "maize" },
  { label: "Mustard seed", itemName: "Mustard seed", quantity: 20, unit: "kg", district: "Mymensingh", crop: "mustard" },
];

export default function Marketplace() {
  const [params] = useSearchParams();
  const planSuggestions = useMemo(readSeasonPlanSuggestions, []);
  const [itemName, setItemName] = useState(params.get("itemName") ?? planSuggestions[0]?.itemName ?? "Urea fertilizer");
  const [quantity, setQuantity] = useState(Number(params.get("quantity") ?? planSuggestions[0]?.quantity ?? 120));
  const [unit, setUnit] = useState(params.get("unit") ?? planSuggestions[0]?.unit ?? "kg");
  const [district, setDistrict] = useState(params.get("district") ?? "Gazipur");
  const [crop, setCrop] = useState(params.get("crop") ?? planSuggestions[0]?.crop ?? "rice");
  const [payMobile, setPayMobile] = useState("01812345678");
  const [result, setResult] = useState<MarketplaceIntelligenceResult | null>(null);
  const [runs, setRuns] = useState<MarketplaceRunRecord[]>([]);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void refreshRuns();
  }, []);

  async function refreshRuns() {
    try {
      const nextRuns = await listMarketplaceRuns({ limit: 12 });
      setRuns(nextRuns);
      if (!result && nextRuns[0]) setResult(nextRuns[0]);
    } catch {
      setRuns([]);
    }
  }

  async function runIntelligence(event?: FormEvent) {
    event?.preventDefault();
    await runNeed({ itemName, quantity, unit, district, crop });
  }

  async function runNeed(need: MarketplaceNeedSuggestion) {
    setLoading(true);
    setError(null);
    try {
      const response = await getMarketplaceIntelligence({
        itemName: need.itemName,
        quantity: need.quantity,
        unit: need.unit,
        district: need.district ?? district,
        crop: need.crop,
      });
      setResult(response);
      await refreshRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run marketplace intelligence");
    } finally {
      setLoading(false);
    }
  }

  async function openRun(id: string) {
    setError(null);
    setLoadingRunId(id);
    try {
      const run = await getMarketplaceRun(id);
      setResult(run);
      setItemName(run.needs.itemName);
      setQuantity(run.needs.quantity);
      setUnit(run.needs.unit);
      setDistrict(run.needs.district ?? district);
      setCrop(run.priceIntelligence.crop);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved comparison");
    } finally {
      setLoadingRunId(null);
    }
  }

  function applyNeed(need: MarketplaceNeedSuggestion, run = false) {
    setItemName(need.itemName);
    setQuantity(need.quantity);
    setUnit(need.unit);
    setCrop(need.crop);
    if (need.district) setDistrict(need.district);
    if (run) {
      void runNeed(need);
    }
  }

  const bestOffer = result?.supplierOffers[0];

  return (
    <>
      <PageMeta
        title="Marketplace Intelligence · ICT Fest"
        description="Supplier comparison and market price recommendation agent"
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Marketplace Intelligence</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Supplier ranking, market price history, sell/store/wait reasoning, mem0 memory, and trace.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {planSuggestions.slice(0, 3).map((suggestion) => (
            <button
              key={`${suggestion.itemName}-${suggestion.quantity}-${suggestion.unit}`}
              type="button"
              onClick={() => applyNeed(suggestion)}
              className="rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-xs font-medium text-success-700 hover:bg-success-100 dark:border-success-500/20 dark:bg-success-500/10 dark:text-success-300"
            >
              Plan: {suggestion.itemName}
            </button>
          ))}
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                setItemName(preset.itemName);
                setQuantity(preset.quantity);
                setUnit(preset.unit);
                setDistrict(preset.district);
                setCrop(preset.crop);
              }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-200"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">
          {error}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2">
            <SearchIcon width={18} height={18} />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Input Need</h2>
          </div>
          <form onSubmit={(event) => void runIntelligence(event)} className="mt-4 space-y-3">
            <Field label="Item">
              <input value={itemName} onChange={(event) => setItemName(event.target.value)} className={inputClass} />
            </Field>
            <div className="grid grid-cols-[1fr_92px] gap-3">
              <Field label="Quantity">
                <input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className={inputClass} />
              </Field>
              <Field label="Unit">
                <input value={unit} onChange={(event) => setUnit(event.target.value)} className={inputClass} />
              </Field>
            </div>
            <Field label="District">
              <input value={district} onChange={(event) => setDistrict(event.target.value)} className={inputClass} />
            </Field>
            <Field label="Crop for price intel">
              <select value={crop} onChange={(event) => setCrop(event.target.value)} className={inputClass}>
                <option value="rice">Rice</option>
                <option value="maize">Maize</option>
                <option value="mustard">Mustard</option>
              </select>
            </Field>
            <Field label="Mobile (for supplier payment)">
              <input value={payMobile} onChange={(event) => setPayMobile(event.target.value)} placeholder="01XXXXXXXXX" className={inputClass} />
            </Field>
            <button
              type="submit"
              disabled={loading}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              <SearchIcon width={17} height={17} />
              {loading ? "Running agent..." : "Run Marketplace Agent"}
            </button>
          </form>

          {result && (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">Agent answer</p>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">{result.agentMessage}</p>
            </div>
          )}

          <SeasonPlanNeedsPanel suggestions={planSuggestions} onApply={applyNeed} />
        </section>

        <main className="space-y-4">
          <PreviousRunsPanel runs={runs} activeId={result?.id} loadingRunId={loadingRunId} onOpen={(id) => void openRun(id)} />
          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <BoxIcon width={18} height={18} />
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Supplier Comparison</h2>
              </div>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-500">
                {result?.seeded ? "Catalog ready" : "Not run"}
              </span>
            </div>
            {!result ? (
              <EmptyState text="Run the marketplace agent to rank suppliers by price, delivery time, distance, and rating." />
            ) : result.supplierOffers.length === 0 ? (
              <EmptyState text="No supplier has enough matching stock for this need." />
            ) : (
              <div className="mt-4 space-y-3">
                {result.supplierOffers.map((offer, index) => (
                  <SupplierCard key={offer.supplierId} offer={offer} rank={index + 1} best={offer.supplierId === bestOffer?.supplierId} mobile={payMobile} />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
            <div className="flex items-center gap-2">
              <CreditCardIcon width={18} height={18} />
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Market Price Intelligence</h2>
            </div>
            {!result ? (
              <EmptyState text="Current and historical market prices appear here after a run." />
            ) : (
              <PricePanel result={result} />
            )}
          </section>
        </main>

        <aside className="space-y-4">
          <MemoryPanel result={result} />
          <TracePanel result={result} />
        </aside>
      </div>
    </>
  );
}

interface MarketplaceNeedSuggestion {
  itemName: string;
  quantity: number;
  unit: string;
  district?: string;
  crop: string;
  source?: string;
}

function PreviousRunsPanel({
  runs,
  activeId,
  loadingRunId,
  onOpen,
}: {
  runs: MarketplaceRunRecord[];
  activeId?: string;
  loadingRunId: string | null;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListIcon width={18} height={18} />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Previous Comparisons</h2>
        </div>
        <span className="text-xs text-gray-500 dark:text-gray-400">{runs.length} saved</span>
      </div>
      {runs.length === 0 ? (
        <EmptyState text="Saved marketplace comparisons will appear here after the first run." />
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {runs.map((run) => {
            const best = run.supplierOffers[0];
            return (
              <button
                key={run.id}
                type="button"
                onClick={() => onOpen(run.id)}
                disabled={loadingRunId === run.id}
                className={`rounded-lg border p-3 text-left transition ${
                  activeId === run.id
                    ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                    : "border-gray-200 hover:border-brand-200 hover:bg-gray-50 dark:border-gray-800 dark:hover:border-brand-500/30 dark:hover:bg-white/[0.04]"
                } disabled:opacity-60`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{run.needs.itemName}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {run.needs.quantity} {run.needs.unit} · {run.needs.district ?? "Any district"} · {formatDate(run.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-semibold text-brand-500 shadow-sm dark:bg-white/[0.08]">
                    {loadingRunId === run.id ? "Loading" : run.priceIntelligence.recommendation.action.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Metric label="Best" value={best?.supplierName ?? "n/a"} />
                  <Metric label="Price" value={best ? formatMoney(best.unitPriceBdt) : "n/a"} />
                  <Metric label="Total" value={best ? formatMoney(best.totalPriceBdt) : "n/a"} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SeasonPlanNeedsPanel({
  suggestions,
  onApply,
}: {
  suggestions: MarketplaceNeedSuggestion[];
  onApply: (need: MarketplaceNeedSuggestion, run?: boolean) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-4 rounded-lg border border-success-200 bg-success-50/70 p-3 dark:border-success-500/20 dark:bg-success-500/10">
      <p className="text-xs font-semibold text-success-800 dark:text-success-300">Season plan availability</p>
      <div className="mt-2 space-y-2">
        {suggestions.map((suggestion) => (
          <button
            key={`${suggestion.itemName}-${suggestion.quantity}-${suggestion.unit}`}
            type="button"
            onClick={() => onApply(suggestion, true)}
            className="flex w-full items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-left text-xs text-gray-700 hover:bg-success-100 dark:bg-white/[0.05] dark:text-gray-200 dark:hover:bg-success-500/15"
          >
            <span className="min-w-0 truncate">{suggestion.itemName}</span>
            <span className="shrink-0 font-semibold text-success-700 dark:text-success-300">
              {suggestion.quantity} {suggestion.unit}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SupplierCard({ offer, rank, best, mobile }: { offer: SupplierOffer; rank: number; best: boolean; mobile: string }) {
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deposit = Math.min(Math.round(offer.totalPriceBdt), DEPOSIT_CAP);

  async function buy() {
    setError(null);
    setReceipt(null);
    if (!mobile.trim()) {
      setError("Enter a mobile number above to pay.");
      return;
    }
    setBusy(true);
    try {
      const res = await checkoutPayment({
        mobile: mobile.trim(),
        amountBdt: deposit,
        description: `Booking: ${offer.requestedQuantity} ${offer.unit} ${offer.itemName} — ${offer.supplierName}`,
      });
      setReceipt(res);
      if (!res.ok) setError(`${res.statusCode}: ${res.statusDetail ?? "payment failed"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`rounded-lg border p-3 ${best ? "border-success-500/40 bg-success-50/60 dark:bg-success-500/[0.08]" : "border-gray-200 dark:border-gray-800"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">Rank {rank}</p>
          <h3 className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{offer.supplierName}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{offer.district} · {offer.itemName}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-900 shadow-sm dark:bg-white/[0.08] dark:text-white">
          {offer.score}/100
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label="Unit price" value={formatMoney(offer.unitPriceBdt)} />
        <Metric label="Total" value={formatMoney(offer.totalPriceBdt)} />
        <Metric label="Delivery" value={`${offer.deliveryDays}d`} />
        <Metric label="Distance" value={`${offer.distanceKm.toFixed(0)} km`} />
        <Metric label="Rating" value={`${offer.rating.toFixed(1)}/5`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">{offer.rankReason}</p>

      <div className="mt-3 flex items-center gap-3 border-t border-gray-200 pt-3 dark:border-gray-800">
        <button
          type="button"
          onClick={() => void buy()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand-500 px-3 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          <CreditCardIcon width={15} height={15} />
          {busy ? "Charging…" : `Buy · pay ${formatMoney(deposit)} deposit`}
        </button>
        <span className="text-[11px] text-gray-400">via bdapps CaaS (Mobile Account)</span>
      </div>

      {receipt?.status === "success" && (
        <div className="mt-3 rounded-lg border border-success-500/30 bg-success-50 p-3 text-xs text-success-700 dark:bg-success-500/10 dark:text-success-500">
          <p className="font-semibold">✅ Payment received{receipt.mock ? " · MOCK" : ""}</p>
          <p className="mt-1">Charged {formatMoney(receipt.amountBdt)} · Trx {receipt.internalTrxId ?? receipt.externalTrxId}</p>
          {receipt.balanceBeforeBdt != null && (
            <p>Operator balance {formatMoney(receipt.balanceBeforeBdt)} → {formatMoney(receipt.balanceBeforeBdt - receipt.amountBdt)}</p>
          )}
          <p>{receipt.smsSent ? "📩 SMS receipt sent" : "receipt recorded"}</p>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-error-600 dark:text-error-500">⚠️ {error}</p>}
    </div>
  );
}

function PricePanel({ result }: { result: MarketplaceIntelligenceResult }) {
  const price = result.priceIntelligence;
  const actionClass = price.recommendation.action === "sell_now"
    ? "bg-success-50 text-success-600"
    : price.recommendation.action === "store"
      ? "bg-warning-50 text-warning-600"
      : "bg-brand-50 text-brand-500";

  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Current farmgate" value={price.current ? formatMoney(price.current.farmgatePriceBdt) : "n/a"} />
        <Metric label="Current wholesale" value={price.current ? formatMoney(price.current.wholesalePriceBdt) : "n/a"} />
        <Metric label="Trend" value={`${price.trendPct}%`} />
        <Metric label="Confidence" value={`${Math.round(price.recommendation.confidence * 100)}%`} />
      </div>
      <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${actionClass}`}>
          {price.recommendation.action.replace("_", " ")}
        </span>
        <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{price.recommendation.reasoning}</p>
      </div>
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-white/[0.04] dark:text-gray-400">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Market</th>
              <th className="px-3 py-2">Farmgate</th>
              <th className="px-3 py-2">Wholesale</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {price.history.map((point) => (
              <tr key={`${point.marketName}-${point.observedAt}`}>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatDate(point.observedAt)}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{point.marketName}</td>
                <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{formatMoney(point.farmgatePriceBdt)}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatMoney(point.wholesalePriceBdt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemoryPanel({ result }: { result: MarketplaceIntelligenceResult | null }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <SearchIcon width={18} height={18} />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">mem0 Memory</h2>
      </div>
      {!result ? (
        <EmptyState text="The agent writes and searches marketplace context in mem0 during each run." />
      ) : (
        <div className="mt-3">
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${result.memory.status === "used" ? "bg-success-50 text-success-600" : "bg-warning-50 text-warning-600"}`}>
            {result.memory.status}
          </span>
          <p className="mt-3 text-xs leading-5 text-gray-500 dark:text-gray-400">
            {result.memory.status === "used"
              ? `${result.memory.retrieved.length} memory result(s) retrieved for this marketplace run.`
              : result.memory.error ?? "mem0 is unavailable; marketplace results are still shown."}
          </p>
        </div>
      )}
    </section>
  );
}

function TracePanel({ result }: { result: MarketplaceIntelligenceResult | null }) {
  const trace = useMemo(() => result?.trace ?? [], [result]);
  return (
    <section className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <ListIcon width={18} height={18} />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Agent Trace</h2>
        </div>
      </div>
      <div className="custom-scrollbar max-h-[520px] space-y-2 overflow-y-auto p-3">
        {trace.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No trace events yet.</p>
        ) : (
          trace.map((event, index) => (
            <details key={`${event.toolName}-${index}`} className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]">
              <summary className="cursor-pointer text-xs font-semibold text-gray-800 dark:text-gray-100">
                {event.status} · {event.toolName} · {event.latencyMs}ms
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-gray-700 dark:text-gray-300">
                {JSON.stringify(event, null, 2)}
              </pre>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">{text}</p>;
}

const inputClass = "h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/10 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-100";

function formatMoney(value: number): string {
  return `৳${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(value)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-BD", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

function readSeasonPlanSuggestions(): MarketplaceNeedSuggestion[] {
  const raw = localStorage.getItem("agrisense.latestPlan");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<AgriSenseMessageResult>;
    const plan = parsed.seasonPlan;
    if (!plan) return [];
    const crop = normalizeCropForMarket(plan.crop);
    const suggestions = new Map<string, MarketplaceNeedSuggestion>();

    for (const task of plan.tasks ?? []) {
      for (const input of task.inputs ?? []) {
        const marketItem = normalizePlanInputItem(input.item);
        if (!marketItem) continue;
        const key = `${marketItem}:${input.unit}`;
        const existing = suggestions.get(key);
        suggestions.set(key, {
          itemName: marketItem,
          quantity: roundQuantity((existing?.quantity ?? 0) + Number(input.quantity ?? 0)),
          unit: input.unit || "kg",
          crop,
          source: task.title,
        });
      }
      const fallback = taskToMarketplaceNeed(task, crop);
      if (fallback && !suggestions.has(`${fallback.itemName}:${fallback.unit}`)) {
        suggestions.set(`${fallback.itemName}:${fallback.unit}`, fallback);
      }
    }

    return [...suggestions.values()].slice(0, 8);
  } catch {
    return [];
  }
}

function taskToMarketplaceNeed(task: SeasonPlanTask, crop: string): MarketplaceNeedSuggestion | undefined {
  const text = `${task.title} ${task.description}`.toLowerCase();
  if (text.includes("seed")) return { itemName: `${crop === "rice" ? "Rice" : crop} seed`, quantity: task.quantity ?? 20, unit: task.unit ?? "kg", crop, source: task.title };
  if (text.includes("urea")) return { itemName: "Urea fertilizer", quantity: task.quantity ?? 100, unit: task.unit ?? "kg", crop, source: task.title };
  if (text.includes("tsp")) return { itemName: "TSP fertilizer", quantity: task.quantity ?? 50, unit: task.unit ?? "kg", crop, source: task.title };
  if (text.includes("mop")) return { itemName: "MoP fertilizer", quantity: task.quantity ?? 50, unit: task.unit ?? "kg", crop, source: task.title };
  return undefined;
}

function normalizePlanInputItem(item: string): string | undefined {
  const normalized = item.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized.includes("urea")) return "Urea fertilizer";
  if (normalized.includes("tsp")) return "TSP fertilizer";
  if (normalized.includes("mop") || normalized.includes("potash")) return "MoP fertilizer";
  if (normalized.includes("seed")) return item.trim();
  if (normalized.includes("fertilizer")) return item.trim();
  return undefined;
}

function normalizeCropForMarket(crop: string): string {
  const normalized = crop.toLowerCase();
  if (normalized.includes("rice") || normalized.includes("aman") || normalized.includes("boro")) return "rice";
  if (normalized.includes("maize")) return "maize";
  if (normalized.includes("mustard")) return "mustard";
  return normalized.split(/\s+/)[0] || "rice";
}

function roundQuantity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.round(value * 100) / 100;
}
