import { useEffect, useRef, useState } from "react";
import { BellIcon } from "../../icons/index.js";

const NOTIFICATIONS = [
  { name: "Terry Franci", action: "requests permission to edit", time: "5 min ago" },
  { name: "Alena Franci", action: "requests permission to edit", time: "8 min ago" },
  { name: "Jocelyn Kenter", action: "requests permission to edit", time: "15 min ago" },
];

export default function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(false);
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          setSeen(true);
        }}
        aria-label="Notifications"
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.05] dark:hover:text-white"
      >
        {!seen && (
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-error-500">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error-400 opacity-75" />
          </span>
        )}
        <BellIcon />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 flex w-80 flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-800 dark:bg-gray-dark sm:w-96">
          <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
            <h5 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Notifications
            </h5>
          </div>
          <ul className="flex flex-col gap-1 overflow-y-auto custom-scrollbar">
            {NOTIFICATIONS.map((n) => (
              <li key={n.name}>
                <div className="flex gap-3 rounded-lg p-3 hover:bg-gray-100 dark:hover:bg-white/[0.03]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-medium text-brand-600 dark:bg-brand-500/15">
                    {n.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  </span>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      <span className="font-medium text-gray-800 dark:text-white/90">
                        {n.name}
                      </span>{" "}
                      {n.action}
                    </p>
                    <span className="mt-1 block text-xs text-gray-400">
                      {n.time}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
