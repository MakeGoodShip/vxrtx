import { useState, useEffect, useRef } from "react";
import { sendMessage, sendLongRunningMessage, type ProgressUpdate } from "@/shared/messaging";
import type {
  BookmarkInfo,
  BookmarkOrganizationResult,
  BookmarkDuplicateGroup,
  FolderInfo,
  LocationSuggestion,
  LockedBookmarkFolder,
  GroupingGranularity,
} from "@/shared/types";
import { GranularitySlider } from "../components/GranularitySlider";

type Mode = "menu" | "organize" | "locate" | "duplicates" | "cleanup";
type Status = "idle" | "loading" | "preview" | "applying" | "done";

export function BookmarkOrganizer() {
  const [mode, setMode] = useState<Mode>("menu");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Bookmark Organizer</h2>
        {mode !== "menu" && (
          <button
            onClick={() => setMode("menu")}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Back
          </button>
        )}
      </div>

      {mode === "menu" && <ModeMenu onSelect={setMode} />}
      {mode === "organize" && <OrganizeMode onBack={() => setMode("menu")} />}
      {mode === "locate" && <LocateMode onBack={() => setMode("menu")} />}
      {mode === "duplicates" && (
        <DuplicatesMode onBack={() => setMode("menu")} />
      )}
      {mode === "cleanup" && (
        <CleanupMode onBack={() => setMode("menu")} />
      )}
    </div>
  );
}

function ModeMenu({ onSelect }: { onSelect: (mode: Mode) => void }) {
  const [folders, setFolders] = useState<FolderInfo[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [folderFilter, setFolderFilter] = useState("");

  useEffect(() => {
    loadFoldersAndLocks();
  }, []);

  async function loadFoldersAndLocks() {
    // Load top-level bookmark folders
    try {
      const tree = await chrome.bookmarks.getTree();
      const topFolders: FolderInfo[] = [];
      for (const root of tree) {
        if (root.children) {
          for (const child of root.children) {
            if (!child.url && child.children) {
              // This is a top-level folder (Bookmarks Bar, Other Bookmarks, etc.)
              for (const folder of child.children) {
                if (!folder.url) {
                  topFolders.push({
                    id: folder.id,
                    title: folder.title,
                    path: `${child.title}/${folder.title}`,
                    parentId: child.id,
                  });
                }
              }
            }
          }
        }
      }
      setFolders(topFolders);
    } catch {
      // May not have access yet
    }

    const res = await sendMessage<void, LockedBookmarkFolder[]>(
      "get-locked-bookmark-folders",
    );
    if (res.success && res.data) {
      setLockedIds(new Set(res.data.map((f) => f.folderId)));
    }
  }

  async function handleLock(folder: FolderInfo) {
    const res = await sendMessage("lock-bookmark-folder", {
      folderId: folder.id,
      title: folder.title,
      path: folder.path,
    });
    if (res.success) {
      setLockedIds((prev) => new Set([...prev, folder.id]));
    }
  }

  async function handleUnlock(folderId: string) {
    const res = await sendMessage("unlock-bookmark-folder", { folderId });
    if (res.success) {
      setLockedIds((prev) => {
        const next = new Set(prev);
        next.delete(folderId);
        return next;
      });
    }
  }

  const modes = [
    {
      id: "organize" as Mode,
      title: "Reorganize",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 4h10M2 7h7M2 10h4" />
        </svg>
      ),
    },
    {
      id: "locate" as Mode,
      title: "Place",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 1.5v11M4 9.5l3 3 3-3" />
        </svg>
      ),
    },
    {
      id: "duplicates" as Mode,
      title: "Duplicates",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1.5" y="3.5" width="8" height="8" rx="1" />
          <path d="M4.5 3.5V2.5a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1h-1" />
        </svg>
      ),
    },
    {
      id: "cleanup" as Mode,
      title: "Clean Up",
      icon: (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 3.5a1 1 0 011-1h2.5l1 1.5h4a1 1 0 011 1v4.5a1 1 0 01-1 1h-7.5a1 1 0 01-1-1z" />
          <path d="M5.5 7l3 0" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1.5">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/60"
          >
            <span className="text-zinc-500">{m.icon}</span>
            <span className="text-xs font-medium text-zinc-200">{m.title}</span>
          </button>
        ))}
      </div>

      {folders.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">
            Bookmark Folders
            {lockedIds.size > 0 && (
              <span className="ml-1 text-xs text-zinc-500">
                ({lockedIds.size} locked)
              </span>
            )}
          </h3>
          <p className="text-xs text-zinc-600">
            Locked folders are excluded from all organization.
          </p>
          <input
            type="text"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            placeholder="Filter folders..."
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-600 focus:border-brand-400 focus:outline-none"
          />
          {folders.filter((f) =>
            folderFilter
              ? f.title.toLowerCase().includes(folderFilter.toLowerCase()) ||
                f.path.toLowerCase().includes(folderFilter.toLowerCase())
              : true,
          ).map((folder) => {
            const isLocked = lockedIds.has(folder.id);
            return (
              <div
                key={folder.id}
                className={`flex items-center gap-2 rounded-lg border p-2.5 transition-colors ${
                  isLocked
                    ? "border-amber-800/50 bg-amber-950/10"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-500"><path d="M1.5 3.5a1 1 0 011-1h2.5l1 1.5h4a1 1 0 011 1v4.5a1 1 0 01-1 1h-7.5a1 1 0 01-1-1z" /></svg>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {folder.title}
                </span>
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {folder.path.split("/")[0]}
                </span>
                <button
                  onClick={() =>
                    isLocked
                      ? handleUnlock(folder.id)
                      : handleLock(folder)
                  }
                  className={`shrink-0 px-1 text-sm transition-colors ${
                    isLocked
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title={isLocked ? "Unlock folder" : "Lock folder"}
                >
                  {isLocked ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="9" height="6.5" rx="1" /><path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" /></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="9" height="6.5" rx="1" /><path d="M4.5 6V4.5a2.5 2.5 0 015 0v.5" /></svg>
                )}
                </button>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

// ─── Full Reorganize Mode ───────────────────────────────────────────

interface OrganizeData {
  bookmarks: BookmarkInfo[];
  folders: FolderInfo[];
  result: BookmarkOrganizationResult;
}

function useElapsedTimer(running: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  useEffect(() => {
    if (!running) { setElapsed(0); return; }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);
  return elapsed;
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function OrganizeMode({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<OrganizeData | null>(null);
  const [enabledFolders, setEnabledFolders] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [granularity, setGranularity] = useState<GroupingGranularity>(3);
  const [progress, setProgress] = useState<ProgressUpdate | null>(null);
  const elapsed = useElapsedTimer(status === "loading" || status === "applying");

  // Persist preview for tab switching
  useEffect(() => {
    if (status === "preview" && data) {
      chrome.storage.session.set({
        vxrtx_bm_preview: { data, enabledFolders: Array.from(enabledFolders) },
      });
    } else if (status === "idle" || status === "done") {
      chrome.storage.session.remove("vxrtx_bm_preview");
    }
  }, [status, data, enabledFolders]);

  // Restore on mount
  useEffect(() => {
    chrome.storage.session.get("vxrtx_bm_preview").then((stored) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const saved = stored.vxrtx_bm_preview as any;
      if (saved?.data && status === "idle") {
        setData(saved.data as OrganizeData);
        setEnabledFolders(new Set(saved.enabledFolders as number[]));
        setStatus("preview");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze() {
    setStatus("loading");
    setError(null);
    setProgress(null);
    try {
      const response = await sendLongRunningMessage<
        { granularity: GroupingGranularity },
        OrganizeData
      >("organize-bookmarks", { granularity }, setProgress);
      if (response.success && response.data) {
        setData(response.data);
        setEnabledFolders(
          new Set(response.data.result.folders.map((_, i) => i)),
        );
        setStatus("preview");
      } else {
        setError(response.error ?? "Failed to analyze bookmarks");
        setStatus("idle");
      }
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  }

  async function handleApply() {
    if (!data) return;
    setStatus("applying");
    try {
      const enabledFolderData = data.result.folders.filter((_, i) =>
        enabledFolders.has(i),
      );

      // Find the Bookmarks Bar as default parent
      const parentId = data.folders[0]?.id ?? "1";

      const newFolders = enabledFolderData.map((f) => ({
        name: f.name,
        parentId: f.parentId ?? parentId,
      }));

      const moves = enabledFolderData.flatMap((f) =>
        f.bookmarkIds.map((bmId) => ({
          bookmarkId: bmId,
          targetFolderId: `${f.name}:${f.parentId ?? parentId}`,
        })),
      );

      const response = await sendMessage("apply-bookmark-suggestions", {
        moves,
        newFolders,
        removals: [],
        cleanupEmptyFolders: true,
      });

      if (response.success) {
        setStatus("done");
        setUndoAvailable(true);
      } else {
        setError(response.error ?? "Failed to apply changes");
        setStatus("preview");
      }
    } catch (err) {
      setError(String(err));
      setStatus("preview");
    }
  }

  async function handleUndo() {
    const response = await sendMessage("undo-bookmark-changes");
    if (response.success) {
      setUndoAvailable(false);
      setData(null);
      setStatus("idle");
    } else {
      setError(response.error ?? "Undo failed");
    }
  }

  const bookmarkMap = new Map(
    (data?.bookmarks ?? []).map((b) => [b.id, b]),
  );

  return (
    <div className="space-y-4">
      {status === "idle" && (
        <>
          <p className="text-sm text-zinc-500">
            AI will analyze your bookmarks and suggest a new folder structure.
          </p>
          <GranularitySlider value={granularity} onChange={setGranularity} />
          <button
            onClick={handleAnalyze}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal hover:bg-brand-400"
          >
            Analyze Bookmarks
          </button>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-[#f433ab]/20 bg-[#f433ab]/5 p-3 text-sm text-[#f472c8]">
          {error}
        </div>
      )}

      {(status === "loading" || status === "applying") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner />
            <span className="flex-1">
              {status === "applying"
                ? "Applying changes..."
                : progress?.message ?? "Analyzing bookmarks..."}
            </span>
            {elapsed > 0 && (
              <span className="shrink-0 text-xs text-zinc-600">
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>
          {progress && progress.total > 1 && (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-brand-400 transition-all duration-300"
                  style={{
                    width: `${Math.round((progress.current / progress.total) * 100)}%`,
                  }}
                />
              </div>
              <p className="text-[10px] text-zinc-600">
                Batch {progress.current} of {progress.total}
              </p>
            </div>
          )}
        </div>
      )}

      {status === "preview" && data && (
        <div className="space-y-3">
          {data.result.reasoning && (
            <p className="text-xs text-zinc-500">{data.result.reasoning}</p>
          )}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <GranularitySlider
                value={granularity}
                onChange={setGranularity}
              />
            </div>
            <button
              onClick={handleAnalyze}
              className="shrink-0 rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Re-analyze
            </button>
          </div>

          {data.result.folders.length > 0 ? (
            <>
              <h3 className="text-sm font-medium text-zinc-300">
                Suggested Folders
              </h3>
              {data.result.folders.map((folder, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 transition-colors ${
                    enabledFolders.has(i)
                      ? "border-zinc-700 bg-zinc-900"
                      : "border-zinc-800/50 bg-zinc-900/30 opacity-50"
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enabledFolders.has(i)}
                      onChange={() => {
                        setEnabledFolders((prev) => {
                          const next = new Set(prev);
                          if (next.has(i)) next.delete(i);
                          else next.add(i);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 accent-brand-400"
                    />
                    <span className="text-sm font-medium">{folder.name}</span>
                    <span className="text-xs text-zinc-500">
                      {folder.bookmarkIds.length} bookmark
                      {folder.bookmarkIds.length !== 1 ? "s" : ""}
                    </span>
                  </label>
                  <div className="mt-2 space-y-0.5 pl-6">
                    {folder.bookmarkIds.slice(0, 5).map((bmId) => {
                      const bm = bookmarkMap.get(bmId);
                      return bm ? (
                        <div
                          key={bmId}
                          className="truncate text-xs text-zinc-500"
                        >
                          {bm.title}
                        </div>
                      ) : null;
                    })}
                    {folder.bookmarkIds.length > 5 && (
                      <div className="text-xs text-zinc-600">
                        +{folder.bookmarkIds.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
                <button
                  onClick={handleApply}
                  disabled={enabledFolders.size === 0}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal hover:bg-brand-400 disabled:opacity-40"
                >
                  Apply ({enabledFolders.size})
                </button>
                <button
                  onClick={onBack}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-green-800/50 bg-green-950/20">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                  <path d="M6 10l3 3 5-6" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-400">Bookmarks look good</p>
              <p className="mt-1 max-w-[220px] text-[11px] text-zinc-600">
                No reorganization needed. Your folders are well organized.
              </p>
            </div>
          )}
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-950/50 p-3 text-sm text-green-300">
            Bookmarks reorganized!
          </div>
          <div className="flex gap-2">
            {undoAvailable && (
              <button
                onClick={handleUndo}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-950/30"
              >
                Undo
              </button>
            )}
            <button
              onClick={onBack}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── "Where Should This Go?" Mode ──────────────────────────────────

function LocateMode({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<"pick" | "loading" | "results">("pick");
  const [bookmarks, setBookmarks] = useState<BookmarkInfo[]>([]);
  const [selected, setSelected] = useState<BookmarkInfo | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadBookmarks() {
    const response = await sendMessage<void, { bookmarks: BookmarkInfo[]; folders: FolderInfo[]; result: BookmarkOrganizationResult }>(
      "organize-bookmarks",
    );
    if (response.success && response.data) {
      setBookmarks(response.data.bookmarks);
    }
  }

  // Load bookmarks on mount
  if (bookmarks.length === 0 && status === "pick") {
    loadBookmarks();
  }

  async function handleSelect(bookmark: BookmarkInfo) {
    setSelected(bookmark);
    setStatus("loading");
    setError(null);
    try {
      const response = await sendMessage<
        { bookmark: BookmarkInfo },
        { suggestions: LocationSuggestion[] }
      >("suggest-bookmark-location", { bookmark });
      if (response.success && response.data) {
        setSuggestions(response.data.suggestions);
        setStatus("results");
      } else {
        setError(response.error ?? "Failed to get suggestions");
        setStatus("pick");
      }
    } catch (err) {
      setError(String(err));
      setStatus("pick");
    }
  }

  async function handleMove(folderId: string) {
    if (!selected) return;
    try {
      await sendMessage("apply-bookmark-suggestions", {
        moves: [{ bookmarkId: selected.id, targetFolderId: folderId }],
        newFolders: [],
        removals: [],
        cleanupEmptyFolders: true,
      });
      setStatus("pick");
      setSelected(null);
      setSuggestions([]);
      // Refresh bookmarks list
      loadBookmarks();
    } catch (err) {
      setError(String(err));
    }
  }

  const filtered = search
    ? bookmarks.filter(
        (b) =>
          b.title.toLowerCase().includes(search.toLowerCase()) ||
          (b.url ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : bookmarks;

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-[#f433ab]/20 bg-[#f433ab]/5 p-3 text-sm text-[#f472c8]">
          {error}
        </div>
      )}

      {status === "pick" && (
        <>
          <p className="text-sm text-zinc-500">
            Select a bookmark to find the best folder for it.
          </p>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search bookmarks..."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-brand-400 focus:outline-none"
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {filtered.slice(0, 50).map((bm) => (
              <button
                key={bm.id}
                onClick={() => handleSelect(bm)}
                className="w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900"
              >
                <div className="truncate text-xs font-medium text-zinc-300">
                  {bm.title}
                </div>
                {bm.url && (
                  <div className="truncate text-[10px] text-zinc-600">
                    {bm.url}
                  </div>
                )}
              </button>
            ))}
            {filtered.length > 50 && (
              <p className="text-center text-xs text-zinc-600">
                Showing 50 of {filtered.length} — refine your search
              </p>
            )}
            {filtered.length === 0 && bookmarks.length > 0 && (
              <p className="py-4 text-center text-xs text-zinc-600">
                No bookmarks match your search
              </p>
            )}
            {bookmarks.length === 0 && (
              <div className="flex flex-col items-center py-6 text-center">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                    <path d="M5 3h10a1.5 1.5 0 011.5 1.5v13l-6.5-4-6.5 4V4.5A1.5 1.5 0 015 3z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-zinc-400">No bookmarks</p>
                <p className="mt-1 max-w-[220px] text-[11px] text-zinc-600">
                  Add some bookmarks first, then come back to organize them.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {status === "loading" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            <div className="text-xs font-medium text-zinc-300">
              {selected?.title}
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Spinner />
            Finding best folder...
          </div>
        </div>
      )}

      {status === "results" && selected && (
        <div className="space-y-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            <div className="text-xs font-medium text-zinc-300">
              {selected.title}
            </div>
            {selected.url && (
              <div className="truncate text-[10px] text-zinc-600">
                {selected.url}
              </div>
            )}
          </div>

          <h3 className="text-sm font-medium text-zinc-300">
            Suggested Folders
          </h3>
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => handleMove(s.folderId)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors hover:border-brand-500"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">
                  {s.folderPath}
                </span>
                <span className="shrink-0 rounded-full bg-brand-950 px-2 py-0.5 text-[10px] text-brand-400">
                  {Math.round(s.confidence * 100)}%
                </span>
              </div>
              <div className="mt-1 text-xs text-zinc-500">{s.reason}</div>
            </button>
          ))}

          <button
            onClick={() => {
              setStatus("pick");
              setSelected(null);
              setSuggestions([]);
            }}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Pick a different bookmark
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Duplicate Cleanup Mode ─────────────────────────────────────────

interface DuplicateData {
  duplicates: BookmarkDuplicateGroup[];
  folderPaths: Record<string, string>;
}

function DuplicatesMode({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<DuplicateData | null>(null);
  const [removals, setRemovals] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);

  async function handleScan() {
    setStatus("loading");
    setError(null);
    try {
      const response = await sendMessage<void, DuplicateData>(
        "find-duplicate-bookmarks",
      );
      if (response.success && response.data) {
        setData(response.data);
        // Pre-select all duplicates except the first in each group
        const preselected = new Set<string>();
        for (const group of response.data.duplicates) {
          for (let i = 1; i < group.bookmarks.length; i++) {
            preselected.add(group.bookmarks[i].id);
          }
        }
        setRemovals(preselected);
        setStatus("preview");
      } else {
        setError(response.error ?? "Failed to scan bookmarks");
        setStatus("idle");
      }
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  }

  async function handleApply() {
    setStatus("applying");
    try {
      const response = await sendMessage("apply-bookmark-suggestions", {
        moves: [],
        newFolders: [],
        removals: Array.from(removals),
        cleanupEmptyFolders: true,
      });
      if (response.success) {
        setStatus("done");
        setUndoAvailable(true);
      } else {
        setError(response.error ?? "Failed to remove duplicates");
        setStatus("preview");
      }
    } catch (err) {
      setError(String(err));
      setStatus("preview");
    }
  }

  async function handleUndo() {
    const response = await sendMessage("undo-bookmark-changes");
    if (response.success) {
      setUndoAvailable(false);
      setData(null);
      setStatus("idle");
    } else {
      setError(response.error ?? "Undo failed");
    }
  }

  function toggleRemoval(id: string) {
    setRemovals((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {status === "idle" && (
        <>
          <p className="text-sm text-zinc-500">
            Scan your bookmarks for exact URL duplicates.
          </p>
          <button
            onClick={handleScan}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal hover:bg-brand-400"
          >
            Scan for Duplicates
          </button>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-[#f433ab]/20 bg-[#f433ab]/5 p-3 text-sm text-[#f472c8]">
          {error}
        </div>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          Scanning bookmarks...
        </div>
      )}

      {status === "preview" && data && (
        <div className="space-y-3">
          {data.duplicates.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-green-800/50 bg-green-950/20">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                  <path d="M6 10l3 3 5-6" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-400">No duplicates</p>
              <p className="mt-1 max-w-[220px] text-[11px] text-zinc-600">
                All your bookmarks are unique.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                Found {data.duplicates.length} set
                {data.duplicates.length > 1 ? "s" : ""} of duplicates.
                First bookmark in each set is kept by default.
              </p>

              {data.duplicates.map((group, gi) => (
                <div
                  key={gi}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                >
                  <div className="mb-2 truncate text-xs text-zinc-500">
                    {group.url}
                  </div>
                  {group.bookmarks.map((bm, bi) => {
                    const folderPath =
                      bm.parentId ? data.folderPaths[bm.parentId] : "Unknown";
                    const isFirst = bi === 0;

                    return (
                      <div
                        key={bm.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-800/50"
                      >
                        {isFirst ? (
                          <div className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <input
                            type="checkbox"
                            checked={removals.has(bm.id)}
                            onChange={() => toggleRemoval(bm.id)}
                            className="h-3.5 w-3.5 shrink-0 accent-brand-400"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs text-zinc-300">
                            {bm.title}
                          </div>
                          <div className="truncate text-[10px] text-zinc-600">
                            in {folderPath}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] ${
                            isFirst ? "text-green-500" : "text-zinc-600"
                          }`}
                        >
                          {isFirst
                            ? "keep"
                            : removals.has(bm.id)
                              ? "remove"
                              : "keep"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
                <button
                  onClick={handleApply}
                  disabled={removals.size === 0}
                  className="rounded-lg bg-[#f433ab] px-4 py-2 text-sm font-medium text-coal hover:bg-[#f472c8] disabled:opacity-40"
                >
                  Remove {removals.size} Duplicate
                  {removals.size !== 1 ? "s" : ""}
                </button>
                <button
                  onClick={onBack}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {status === "applying" && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          Removing duplicates...
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-950/50 p-3 text-sm text-green-300">
            Duplicates removed!
          </div>
          <div className="flex gap-2">
            {undoAvailable && (
              <button
                onClick={handleUndo}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-300 hover:bg-amber-950/30"
              >
                Undo
              </button>
            )}
            <button
              onClick={onBack}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Empty Folder Cleanup Mode ──────────────────────────────────────

function CleanupMode({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [removed, setRemoved] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleCleanup() {
    setStatus("loading");
    setError(null);
    try {
      const response = await sendMessage<void, { removed: number }>(
        "cleanup-empty-folders",
      );
      if (response.success && response.data) {
        setRemoved(response.data.removed);
        setStatus("done");
      } else {
        setError(response.error ?? "Cleanup failed");
        setStatus("idle");
      }
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[#f433ab]/20 bg-[#f433ab]/5 p-3 text-sm text-[#f472c8]">
          {error}
        </div>
      )}

      {status === "idle" && (
        <>
          <p className="text-sm text-zinc-500">
            Scan for and remove empty bookmark folders. This runs in multiple
            passes to catch nested empty folders.
          </p>
          <button
            onClick={handleCleanup}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal hover:bg-brand-400"
          >
            Clean Up Empty Folders
          </button>
        </>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          Scanning and removing empty folders...
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-950/50 p-3 text-sm text-green-300">
            {removed === 0
              ? "No empty folders found — bookmarks are clean!"
              : `Removed ${removed} empty folder${removed !== 1 ? "s" : ""}.`}
          </div>
          <button
            onClick={onBack}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-brand-400" style={{ filter: "drop-shadow(0 0 4px var(--color-brand-400))" }} />
  );
}
