import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import type { AdminStats } from "../../api/stats.js";

interface Props {
  stats: AdminStats | null;
}

export default function GrowthChart({ stats }: Props) {
  const months = stats?.signupsByMonth ?? [];

  // Cumulative total across the trailing 12 months.
  let running = 0;
  const cumulative = months.map((m) => (running += m.count));

  const options: ApexOptions = {
    chart: {
      type: "area",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
    },
    colors: ["#465fff", "#9cb9ff"],
    stroke: { curve: "smooth", width: 2 },
    fill: {
      type: "gradient",
      gradient: { opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#e4e7ec",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
    },
    xaxis: {
      type: "category",
      categories: months.map((m) => m.month),
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: "#98a2b3" } },
    },
    yaxis: {
      labels: {
        style: { colors: "#98a2b3" },
        formatter: (v) => `${Math.round(v)}`,
      },
    },
    legend: { show: true, position: "top", horizontalAlign: "left" },
  };

  const series = [
    { name: "Total users", data: cumulative },
    { name: "New signups", data: months.map((m) => m.count) },
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          User Growth
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Cumulative accounts vs new signups per month
        </p>
      </div>
      <div className="overflow-x-auto custom-scrollbar">
        <div className="min-w-[700px]">
          <Chart options={options} series={series} type="area" height={310} />
        </div>
      </div>
    </div>
  );
}
