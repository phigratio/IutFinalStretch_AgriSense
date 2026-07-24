import { Link } from "react-router-dom";

interface Props {
  pageTitle: string;
}

export default function PageBreadcrumb({ pageTitle }: Props) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold text-gray-800 dark:text-white/90">
        {pageTitle}
      </h2>
      <nav>
        <ol className="flex items-center gap-1.5 text-sm">
          <li>
            <Link
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              to="/"
            >
              Home
            </Link>
          </li>
          <li className="text-gray-400">/</li>
          <li className="text-gray-800 dark:text-white/90">{pageTitle}</li>
        </ol>
      </nav>
    </div>
  );
}
