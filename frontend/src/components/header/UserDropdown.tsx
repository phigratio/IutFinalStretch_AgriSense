import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDownIcon } from "../../icons/index.js";
import { useAuth } from "../../context/AuthContext.js";

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function UserDropdown() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!user) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-gray-700 dark:text-gray-300"
      >
        <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-brand-500 font-semibold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:block">
          {user.name}
        </span>
        <ChevronDownIcon
          className={`hidden transition-transform sm:block ${open ? "rotate-180" : ""}`}
          width={16}
          height={16}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-dark">
          <div className="border-b border-gray-200 pb-3 dark:border-gray-800">
            <span className="block truncate text-sm font-medium text-gray-700 dark:text-gray-200">
              {user.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
              {user.email}
            </span>
          </div>
          <ul className="flex flex-col gap-1 pt-3">
            <li>
              <Link
                to="/profile"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Edit profile
              </Link>
            </li>
            <li>
              <button
                onClick={() => {
                  setOpen(false);
                  logout();
                  navigate("/signin", { replace: true });
                }}
                className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.05]"
              >
                Sign out
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
