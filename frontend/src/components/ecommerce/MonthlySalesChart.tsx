import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";
import { HorizontalDotsIcon } from "../../icons/index.js";
import type { AdminStats } from "../../api/stats.js";

interface Props {
  stats: AdminStats | null;
}

export default function MonthlySignupsChart({ stats }: Props) {
  const months = stats?.signupsByMonth ?? [];

  const options: ApexOptions = {
    chart: {
      type: "bar",
      fontFamily: "Outfit, sans-serif",
      toolbar: { show: false },
    },
    colors: ["#465fff"],
    plotOptions: {
      bar: { horizontal: false, columnWidth: "39%", borderRadius: 5 },
    },
    dataLabels: { enabled: false },
    grid: {
      borderColor: "#e4e7ec",
      strokeDashArray: 4,
      yaxis: { lines: { show: true } },
    },
    xaxis: {
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
    legend: { show: false },
    tooltip: { y: { formatter: (v) => `${v} signups` } },
  };

  const series = [{ name: "Signups", data: months.map((m) => m.count) }];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 pb-5 pt-5 dark:border-gray-800 dark:bg-white/[0.03] sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Monthly Signups
          </h3>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            New accounts over the last 12 months
          </p>
        </div>
        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <HorizontalDotsIcon />
        </button>
      </div>
      <div className="-ml-4 overflow-x-auto custom-scrollbar">
        <div className="min-w-[600px]">
          <Chart options={options} series={series} type="bar" height={200} />
        </div>
      </div>
    </div>
  );
}
