import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import type { AdminStats } from "../../api/stats.js";

interface Props {
  stats: AdminStats | null;
}

const options: ApexOptions = {
  chart: {
    type: "radialBar",
    fontFamily: "Outfit, sans-serif",
    sparkline: { enabled: true },
  },
  colors: ["#465fff"],
  plotOptions: {
    radialBar: {
      startAngle: -85,
      endAngle: 85,
      hollow: { size: "80%" },
      track: { background: "#e4e7ec", strokeWidth: "100%" },
      dataLabels: {
        name: { show: false },
        value: {
          fontSize: "32px",
          fontWeight: "700",
          offsetY: -40,
          color: "#1d2939",
          formatter: (v) => `${Math.round(Number(v))}%`,
        },
      },
    },
  },
  fill: { type: "solid", colors: ["#465fff"] },
  stroke: { lineCap: "round" },
  labels: ["Verified"],
};

export default function VerifiedAccounts({ stats }: Props) {
  const total = stats?.totalUsers ?? 0;
  const verified = stats?.verifiedUsers ?? 0;
  const percent = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] sm:p-6">
      <div className="mb-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Verified Accounts
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Share of users with a verified email
        </p>
      </div>

      <div className="relative -mt-2">
        <Chart options={options} series={[percent]} type="radialBar" height={280} />
      </div>

      <p className="mx-auto mt-2 max-w-xs text-center text-sm text-gray-500 dark:text-gray-400">
        {total === 0
          ? "No users registered yet."
          : `${verified} of ${total} account${total === 1 ? "" : "s"} verified. Google sign-ins are verified automatically.`}
      </p>

      <div className="mt-6 flex items-center justify-around border-t border-gray-200 pt-5 dark:border-gray-800">
        {[
          { label: "Total", value: total },
          { label: "Verified", value: verified },
          { label: "Pending", value: total - verified },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            <p className="text-base font-semibold text-gray-800 dark:text-white/90">
              {s.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
