import PageMeta from "../components/common/PageMeta.js";
import PageBreadcrumb from "../components/common/PageBreadcrumb.js";
import { CalendarIcon } from "../icons/index.js";

export default function Calendar() {
  return (
    <>
      <PageMeta title="Calendar · ICT Fest Admin" description="Calendar" />
      <PageBreadcrumb pageTitle="Calendar" />
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center dark:border-gray-700 dark:bg-white/[0.03]">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
          <CalendarIcon width={28} height={28} />
        </span>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          Calendar
        </h3>
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
          A drag-and-drop event calendar would live here. This is a placeholder
          page in the free layout.
        </p>
      </div>
    </>
  );
}
