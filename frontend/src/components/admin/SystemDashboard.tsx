import { useEffect, useState, type ReactNode } from "react";
import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { Link } from "react-router-dom";
import PageMeta from "../common/PageMeta.js";
import { getSystemStats, type SystemStats, type LabelCount } from "../../api/stats.js";
import { listUsers, type User } from "../../api/users.js";

/**
 * Admin-only whole-system dashboard: entity KPIs, category charts, a plans
 * time-series, and recent-activity tables across every module. Distinct from the
 * farmer-facing analytics (AnalyticsDashboard) — this is the platform operator view.
 */

const PALETTE = ["#465fff", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#64748b", "#ec4899"];

export default function SystemDashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSystemStats(), listUsers()])
      .then(([s, u]) => { if (cancelled) return; setStats(s); setUsers(u); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load system stats"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <PageMeta title="System Overview · AgriSense Admin" description="Platform-wide analytics across every module" />

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">System Overview</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Platform-wide analytics across users, farms, plans, alerts, payments, and knowledge.</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-error-500/30 bg-error-50 px-4 py-3 text-sm text-error-600 dark:bg-error-500/10 dark:text-error-500">{error}</div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <Tile label="Total Users" value={stats?.counts.users} loading={loading} accent />
        <Tile label="Farmers" value={stats?.counts.farmers} loading={loading} />
        <Tile label="Farms" value={stats?.counts.farms} loading={loading} />
        <Tile label="Agent Sessions" value={stats?.counts.sessions} loading={loading} />
        <Tile label="Season Plans" value={stats?.counts.plans} loading={loading} />
        <Tile label="Proactive Alerts" value={stats?.counts.alerts} loading={loading} />
        <Tile label="Payments" value={stats?.counts.payments} loading={loading} />
        <Tile label="Tool Calls" value={stats?.counts.toolCalls} loading={loading} />
        <Tile label="Suppliers" value={stats?.counts.suppliers} loading={loading} />
        <Tile label="Market Orders" value={stats?.counts.marketOrders} loading={loading} />
        <Tile label="KB Documents" value={stats?.counts.kbDocuments} loading={loading} />
        <Tile label="Leaf Diagnoses" value={stats?.counts.leafDiagnoses} loading={loading} />
        <Tile label="Pest Assessments" value={stats?.counts.pestAssessments} loading={loading} />
        <Tile label="Tenants" value={stats?.counts.tenants} loading={loading} />
      </div>

      {/* Money totals */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <MoneyTile label="Planned net profit (all plans)" value={stats?.totals.plannedNetProfitBdt} loading={loading} />
        <MoneyTile label="Payment volume (BDApps)" value={stats?.totals.paymentsVolumeBdt} loading={loading} />
      </div>

      {/* Charts */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-7" title="Season plans by crop">
          <BarChart data={stats?.plansByCrop ?? []} />
        </Card>
        <Card className="xl:col-span-5" title="Users by role">
          <DonutChart data={stats?.usersByRole ?? []} />
        </Card>
        <Card className="xl:col-span-4" title="Alerts by severity">
          <DonutChart data={stats?.alertsBySeverity ?? []} />
        </Card>
        <Card className="xl:col-span-4" title="Payments by status">
          <DonutChart data={stats?.paymentsByStatus ?? []} />
        </Card>
        <Card className="xl:col-span-4" title="Season plans over time">
          <AreaChart data={stats?.plansByMonth ?? []} />
        </Card>
      </div>

      {/* Tables */}
      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TableCard title="Users" className="xl:col-span-2" action={<Link to="/users" className="text-xs font-medium text-brand-500 hover:text-brand-600">Manage users</Link>}>
          <table className="w-full text-sm">
            <THead cols={["Name", "Email", "Role", "Sign-in", "Verified", "Joined"]} />
            <tbody>
              {users.slice(0, 10).map((u) => (
                <Row key={u.id} cells={[
                  <span className="font-medium">{u.name}</span>,
                  <span className="text-gray-500 dark:text-gray-400">{u.email}</span>,
                  <Badge tone={u.role === "admin" ? "red" : u.role === "tenant" ? "amber" : "gray"}>{u.role}</Badge>,
                  u.provider === "oauth" ? "BDApps" : "Password",
                  <Badge tone={u.emailVerified ? "green" : "gray"}>{u.emailVerified ? "verified" : "no"}</Badge>,
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(u.createdAt)}</span>,
                ]} />
              ))}
              <Empty show={!loading && users.length === 0} cols={6} text="No users yet." />
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Recent season plans" action={<Link to="/agrisense" className="text-xs font-medium text-brand-500 hover:text-brand-600">Open AgriSense</Link>}>
          <table className="w-full text-sm">
            <THead cols={["Crop", "Location", "Net profit", "ROI", "Risk"]} />
            <tbody>
              {(stats?.recentPlans ?? []).map((p) => (
                <Row key={p.id} cells={[
                  <span className="font-medium capitalize">{p.crop}</span>,
                  p.locationText ?? "—",
                  p.netProfitBdt != null ? `৳${Math.round(p.netProfitBdt).toLocaleString()}` : "—",
                  p.roiPct != null ? `${p.roiPct}%` : "—",
                  <Badge tone={riskTone(p.riskLevel)}>{p.riskLevel ?? "—"}</Badge>,
                ]} />
              ))}
              <Empty show={!loading && (stats?.recentPlans.length ?? 0) === 0} cols={5} text="No season plans yet." />
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Recent BDApps payments" action={<Link to="/payments" className="text-xs font-medium text-brand-500 hover:text-brand-600">Payments</Link>}>
          <table className="w-full text-sm">
            <THead cols={["Mobile", "Amount", "Status", "Receipt"]} />
            <tbody>
              {(stats?.recentPayments ?? []).map((p) => (
                <Row key={p.id} cells={[
                  p.mobile ?? "—",
                  p.amountBdt != null ? `৳${Math.round(p.amountBdt).toLocaleString()}` : "—",
                  <Badge tone={paymentTone(p.status)}>{p.status}</Badge>,
                  <span className="text-xs text-gray-500 dark:text-gray-400">{p.receiptNumber ?? "—"}</span>,
                ]} />
              ))}
              <Empty show={!loading && (stats?.recentPayments.length ?? 0) === 0} cols={4} text="No payments yet." />
            </tbody>
          </table>
        </TableCard>

        <TableCard title="Recent proactive alerts" className="xl:col-span-2" action={<Link to="/temporal" className="text-xs font-medium text-brand-500 hover:text-brand-600">Temporal</Link>}>
          <table className="w-full text-sm">
            <THead cols={["Type", "Severity", "Title", "Status", "When"]} />
            <tbody>
              {(stats?.recentAlerts ?? []).map((a) => (
                <Row key={a.id} cells={[
                  <span className="capitalize">{a.alertType.replace(/_/g, " ")}</span>,
                  <Badge tone={severityTone(a.severity)}>{a.severity}</Badge>,
                  <span className="line-clamp-1">{a.title}</span>,
                  a.status ?? "—",
                  <span className="text-xs text-gray-500 dark:text-gray-400">{formatDate(a.createdAt)}</span>,
                ]} />
              ))}
              <Empty show={!loading && (stats?.recentAlerts.length ?? 0) === 0} cols={5} text="No alerts yet." />
            </tbody>
          </table>
        </TableCard>
      </div>
    </>
  );
}

/* ---------- tiles & cards ---------- */

function Tile({ label, value, loading, accent }: { label: string; value?: number; loading: boolean; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-brand-500/30 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10" : "border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]"}`}>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-gray-800 dark:text-white/90">{loading ? "…" : (value ?? 0).toLocaleString()}</div>
    </div>
  );
}

function MoneyTile({ label, value, loading }: { label: string; value?: number; loading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-green-600 dark:text-green-400">{loading ? "…" : `৳${Math.round(value ?? 0).toLocaleString()}`}</div>
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <h3 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
      {children}
    </div>
  );
}

function TableCard({ title, children, action, className = "" }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03] ${className}`}>
      <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-white/90">{title}</h3>
        {action}
      </div>
      <div className="overflow-x-auto px-2 py-1">{children}</div>
    </div>
  );
}

function THead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500">
        {cols.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}
      </tr>
    </thead>
  );
}

function Row({ cells }: { cells: ReactNode[] }) {
  return (
    <tr className="border-t border-gray-100 text-gray-700 dark:border-gray-800 dark:text-gray-200">
      {cells.map((c, i) => <td key={i} className="px-3 py-2.5 align-middle">{c}</td>)}
    </tr>
  );
}

function Empty({ show, cols, text }: { show: boolean; cols: number; text: string }) {
  if (!show) return null;
  return <tr><td colSpan={cols} className="px-3 py-6 text-center text-sm text-gray-400 dark:text-gray-500">{text}</td></tr>;
}

function Badge({ children, tone }: { children: ReactNode; tone: "green" | "red" | "amber" | "gray" | "blue" }) {
  const tones: Record<string, string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    gray: "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-300",
  };
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tones[tone]}`}>{children}</span>;
}

/* ---------- charts ---------- */

function DonutChart({ data }: { data: LabelCount[] }) {
  if (data.length === 0) return <EmptyChart />;
  const options: ApexOptions = {
    chart: { type: "donut", fontFamily: "Outfit, sans-serif" },
    labels: data.map((d) => d.label),
    colors: PALETTE,
    legend: { position: "bottom", labels: { colors: "#9ca3af" } },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    plotOptions: { pie: { donut: { size: "62%" } } },
  };
  return <Chart options={options} series={data.map((d) => d.count)} type="donut" height={240} />;
}

function BarChart({ data }: { data: LabelCount[] }) {
  if (data.length === 0) return <EmptyChart />;
  const options: ApexOptions = {
    chart: { type: "bar", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    colors: ["#465fff"],
    plotOptions: { bar: { borderRadius: 5, columnWidth: "45%" } },
    dataLabels: { enabled: false },
    xaxis: { categories: data.map((d) => d.label), labels: { style: { colors: "#9ca3af" } } },
    yaxis: { labels: { style: { colors: "#9ca3af" } } },
    grid: { borderColor: "#e5e7eb33" },
  };
  return <Chart options={options} series={[{ name: "Plans", data: data.map((d) => d.count) }]} type="bar" height={260} />;
}

function AreaChart({ data }: { data: { month: string; count: number }[] }) {
  if (data.length === 0) return <EmptyChart />;
  const options: ApexOptions = {
    chart: { type: "area", fontFamily: "Outfit, sans-serif", toolbar: { show: false } },
    colors: ["#22c55e"],
    stroke: { curve: "smooth", width: 2 },
    fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0 } },
    dataLabels: { enabled: false },
    xaxis: { categories: data.map((d) => d.month), labels: { style: { colors: "#9ca3af" } } },
    yaxis: { labels: { style: { colors: "#9ca3af" } } },
    grid: { borderColor: "#e5e7eb33" },
  };
  return <Chart options={options} series={[{ name: "Plans", data: data.map((d) => d.count) }]} type="area" height={240} />;
}

function EmptyChart() {
  return <div className="flex h-[240px] items-center justify-center text-sm text-gray-400 dark:text-gray-500">No data yet</div>;
}

/* ---------- helpers ---------- */

function riskTone(risk: string | null): "green" | "amber" | "red" | "gray" {
  if (risk === "low") return "green";
  if (risk === "medium") return "amber";
  if (risk === "high") return "red";
  return "gray";
}
function paymentTone(status: string): "green" | "red" | "amber" | "gray" {
  const s = status.toLowerCase();
  if (s.includes("complete") || s.includes("success") || s === "s1000") return "green";
  if (s.includes("fail") || s.includes("error") || s.includes("declin")) return "red";
  if (s.includes("pending") || s.includes("init")) return "amber";
  return "gray";
}
function severityTone(sev: string): "red" | "amber" | "blue" | "gray" {
  const s = sev.toLowerCase();
  if (s === "high" || s === "critical") return "red";
  if (s === "warning" || s === "medium") return "amber";
  if (s === "info" || s === "low") return "blue";
  return "gray";
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
