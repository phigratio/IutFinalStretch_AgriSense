import { Link } from "react-router-dom";
import PageMeta from "../components/common/PageMeta.js";
import GridShape from "../components/common/GridShape.js";

export default function NotFound() {
  return (
    <>
      <PageMeta title="404 · ICT Fest Admin" description="Page not found" />
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gray-50 px-4 text-center dark:bg-gray-900">
        <GridShape />
        <h1 className="text-title-md font-bold text-brand-500 sm:text-7xl">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-gray-800 dark:text-white/90">
          Page Not Found
        </h2>
        <p className="mt-2 max-w-sm text-sm text-gray-500 dark:text-gray-400">
          We can&apos;t seem to find the page you are looking for.
        </p>
        <Link
          to="/"
          className="mt-6 rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
        >
          Back to Dashboard
        </Link>
      </div>
    </>
  );
}
