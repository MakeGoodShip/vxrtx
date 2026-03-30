import { useState } from "react";
import { TabOrganizer } from "./pages/TabOrganizer";
import { BookmarkOrganizer } from "./pages/BookmarkOrganizer";
import { Snapshots } from "./pages/Snapshots";
import { Settings } from "./pages/Settings";

type Page = "tabs" | "bookmarks" | "snapshots" | "settings";

const NAV_ITEMS: { id: Page; label: string }[] = [
  { id: "tabs", label: "Tabs" },
  { id: "bookmarks", label: "Bookmarks" },
  { id: "snapshots", label: "Snapshots" },
  { id: "settings", label: "Settings" },
];

export function App() {
  const [page, setPage] = useState<Page>("tabs");

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <nav className="flex border-b border-zinc-800">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              page === item.id
                ? "border-b-2 border-brand-400 text-brand-400"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <main className="p-4">
        {page === "tabs" && <TabOrganizer />}
        {page === "bookmarks" && <BookmarkOrganizer />}
        {page === "snapshots" && <Snapshots />}
        {page === "settings" && <Settings />}
      </main>
    </div>
  );
}
