import { useState } from "react";
import { TabOrganizer } from "./pages/TabOrganizer";
import { BookmarkOrganizer } from "./pages/BookmarkOrganizer";
import { Snapshots } from "./pages/Snapshots";
import { Settings } from "./pages/Settings";

type Page = "tabs" | "bookmarks" | "snapshots" | "settings";

const NAV_ITEMS: { id: Page; label: string; icon: React.ReactNode }[] = [
  {
    id: "tabs",
    label: "Tabs",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 2h8a1 1 0 011 1v10.5l-5-3-5 3V3a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    id: "snapshots",
    label: "Snapshots",
    icon: (
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      <header className="flex items-center justify-between border-b border-zinc-800/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500/15">
            <div className="h-2 w-2 rounded-full bg-brand-400 shadow-[0_0_8px_var(--color-brand-400)]" />
          </div>
          <span className="text-xs font-semibold tracking-widest text-zinc-400 uppercase">
            vxrtx
          </span>
        </div>
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
                isActive
                  ? "text-brand-400"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <span className={`transition-transform ${isActive ? "scale-110" : "group-hover:scale-105"}`}>
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-4">
        <div className="animate-fade-in">
          {page === "tabs" && <TabOrganizer />}
          {page === "bookmarks" && <BookmarkOrganizer />}
          {page === "snapshots" && <Snapshots />}
          {page === "settings" && <Settings />}
        </div>
      </main>
    </div>
  );
}
