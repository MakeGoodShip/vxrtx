import { useState } from "react";
import { BookmarkOrganizer } from "./pages/BookmarkOrganizer";
import { Settings } from "./pages/Settings";
import { Snapshots } from "./pages/Snapshots";
import { TabOrganizer } from "./pages/TabOrganizer";

type Page = "tabs" | "bookmarks" | "snapshots" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  {
    id: "tabs",
    label: "Tabs",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1.5" y="3" width="12" height="9.5" rx="1.5" />
        <path d="M1.5 5.5h12" />
        <path d="M5 3v2.5" />
      </svg>
    ),
  },
  {
    id: "bookmarks",
    label: "Bookmarks",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3.5 2h8a1 1 0 011 1v10.5l-5-3-5 3V3a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    id: "snapshots",
    label: "Snapshots",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="2" width="11" height="11" rx="1.5" />
        <circle cx="7.5" cy="7.5" r="2.5" />
        <circle cx="7.5" cy="7.5" r="0.75" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="7.5" cy="7.5" r="2" />
        <path d="M7.5 1.5v1.5M7.5 12v1.5M1.5 7.5H3M12 7.5h1.5M3.3 3.3l1 1M10.7 10.7l1 1M3.3 11.7l1-1M10.7 3.3l1-1" />
      </svg>
    ),
  },
];

export function App() {
  const [page, setPage] = useState<Page>("tabs");

  return (
    <div className="flex min-h-screen flex-col bg-coal text-zinc-100">
      {/* Branded header */}
      <header className="flex items-center justify-center border-b border-zinc-800/60 px-4 py-3">
        <svg
          viewBox="0 0 1072 500"
          fill="none"
          className="h-5 w-auto text-brand-400"
          aria-label="vxrtx"
        >
          <path
            clipRule="evenodd"
            d="m498.274 18.4204.507.1607 168.762-.032 105.642 181.7759s61.647-129.8647 113.814-181.5637c52.167-51.6991 184.431 19.8461 184.431 19.8461s-10.01 6.6281-24.64 31.7405c-11.75 20.1649-13.86 42.4441-13.86 42.4441s-65.359-161.2145-141.391-85.8651c-76.032 75.3491-108.862 189.7291-108.862 189.7291l156.489 269.249h-118.706c-5.596-9.624-15.946-29.507-29.623-55.782l-.098-.187-.223-.429c-17.947-34.476-41.575-79.866-67.771-127.665-.672-1.226-1.349-2.453-2.026-3.682l-.137-.248-1.325-2.404-2.235-4.067s-56.159 121.199-120.973 171.945c-83.112 65.073-217.216 23.577-217.216 23.577l14.83-54.967s75.161 89.584 164.585 49.429c89.423-40.155 155.275-196.297 155.275-196.297-73.819-133.144-117.474-284.990224-206.093-253.2903-45.602 101.1093-126.885 360.9643-156.67 454.7933l-.54-.171-.136.501h-116.565c-56.78-140.252-124.391-291.081-204.3806-420.1647-9.5719-15.4464-31.49272-34.4098-28.931892-40.0816 4.846182-10.7183 49.398492-8.1656 145.338492-8.1656 0 0 104.773 251.6579 133.844 344.4889 29.071 92.83 83.527 49.744 97.43 15.834l32.885-88.156s20.593-58.175 68.431-208.8607l12.517-39.4281z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      </header>

      {/* Navigation */}
      <nav className="flex border-b border-zinc-800/60 px-1">
        {NAV_ITEMS.map((item) => {
          const isActive = page === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={`group relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium tracking-wide transition-colors ${
                isActive ? "text-brand-400" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span
                className={`transition-transform ${isActive ? "scale-110" : "group-hover:scale-105"}`}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-brand-400 shadow-[0_0_6px_var(--color-brand-400)]" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Content — all pages stay mounted to preserve state across tab switches */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className={page === "tabs" ? "animate-fade-in" : "hidden"}>
          <TabOrganizer />
        </div>
        <div className={page === "bookmarks" ? "animate-fade-in" : "hidden"}>
          <BookmarkOrganizer />
        </div>
        <div className={page === "snapshots" ? "animate-fade-in" : "hidden"}>
          <Snapshots />
        </div>
        <div className={page === "settings" ? "animate-fade-in" : "hidden"}>
          <Settings />
        </div>
      </main>
    </div>
  );
}
