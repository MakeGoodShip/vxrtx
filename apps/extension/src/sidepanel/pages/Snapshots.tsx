import { useCallback, useEffect, useRef, useState } from "react";
import { sendMessage } from "@/shared/messaging";
import type { Snapshot, SnapshotType } from "@/shared/types";

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

const TYPE_LABELS: Record<SnapshotType, string> = {
  tabs: "Tabs",
  bookmarks: "Bookmarks",
  both: "Both",
};

const TYPE_COLORS: Record<SnapshotType, string> = {
  tabs: "bg-brand-indigo/30 text-[#8b7fd4]",
  bookmarks: "bg-[#f433ab]/10 text-[#f472c8]",
  both: "bg-brand-900/50 text-brand-300",
};

export function Snapshots() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<SnapshotType>("both");
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const loadSnapshots = useCallback(async () => {
    const response = await sendMessage<void, Snapshot[]>("get-snapshots");
    if (response.success && response.data) {
      setSnapshots(response.data);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  async function handleCreate() {
    if (!newLabel.trim()) return;
    setSaving(true);
    const response = await sendMessage<{ label: string; type: SnapshotType }, void>(
      "create-snapshot",
      { label: newLabel.trim(), type: newType },
    );
    setSaving(false);
    if (response.success) {
      setCreating(false);
      setNewLabel("");
      setNewType("both");
      await loadSnapshots();
    }
  }

  async function handleRestore(id: string, restoreType: SnapshotType) {
    setRestoring(id);
    setMessage(null);
    const response = await sendMessage<
      { id: string; restoreType: SnapshotType },
      {
        tabsRestored: number;
        tabsSkipped: number;
        bookmarksRestored: number;
        bookmarksSkipped: number;
      }
    >("restore-snapshot", { id, restoreType });
    setRestoring(null);

    if (response.success && response.data) {
      const d = response.data;
      const parts: string[] = [];
      if (d.tabsRestored > 0 || d.tabsSkipped > 0) {
        parts.push(
          `${d.tabsRestored} tab${d.tabsRestored !== 1 ? "s" : ""} restored${d.tabsSkipped > 0 ? `, ${d.tabsSkipped} skipped` : ""}`,
        );
      }
      if (d.bookmarksRestored > 0 || d.bookmarksSkipped > 0) {
        parts.push(
          `${d.bookmarksRestored} bookmark${d.bookmarksRestored !== 1 ? "s" : ""} restored${d.bookmarksSkipped > 0 ? `, ${d.bookmarksSkipped} skipped` : ""}`,
        );
      }
      setMessage({
        text: parts.join(". ") || "Nothing to restore.",
        type: "success",
      });
    } else {
      setMessage({
        text: response.error ?? "Restore failed",
        type: "error",
      });
    }
  }

  async function handleDelete(id: string) {
    await sendMessage<{ id: string }, void>("delete-snapshot", { id });
    setConfirmDeleteId(null);
    setExpandedId(null);
    await loadSnapshots();
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) return;
    await sendMessage<{ id: string; label: string }, void>("rename-snapshot", {
      id,
      label: renameValue.trim(),
    });
    setRenamingId(null);
    setRenameValue("");
    await loadSnapshots();
  }

  function handleExport(snap: Snapshot) {
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vxrtx-snapshot-${snap.label.replace(/[^a-zA-Z0-9-_]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportAll() {
    const blob = new Blob([JSON.stringify(snapshots, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vxrtx-snapshots-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Accept either a single snapshot or an array
      const incoming: Snapshot[] = Array.isArray(parsed) ? parsed : [parsed];

      // Basic validation
      for (const s of incoming) {
        if (!s.id || !s.timestamp || !s.type || !s.label) {
          setMessage({ text: "Invalid snapshot file format.", type: "error" });
          return;
        }
      }

      const response = await sendMessage<{ snapshots: Snapshot[] }, { imported: number }>(
        "import-snapshots",
        { snapshots: incoming },
      );

      if (response.success && response.data) {
        setMessage({
          text: `Imported ${response.data.imported} snapshot${response.data.imported !== 1 ? "s" : ""}.`,
          type: "success",
        });
        await loadSnapshots();
      } else {
        setMessage({
          text: response.error ?? "Import failed.",
          type: "error",
        });
      }
    } catch {
      setMessage({ text: "Failed to read snapshot file.", type: "error" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">Snapshots</h2>
        <div className="flex items-center gap-1.5">
          <label className="cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
            Import
            <input
              ref={importRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImport(file);
                e.target.value = "";
              }}
            />
          </label>
          {snapshots.length > 0 && (
            <button
              onClick={handleExportAll}
              className="rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            >
              Export All
            </button>
          )}
          <button
            onClick={() => setCreating(!creating)}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-medium text-coal hover:bg-brand-400"
          >
            {creating ? "Cancel" : "New Snapshot"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.type === "success"
              ? "border-green-800 bg-green-950/50 text-green-300"
              : "border-[#f433ab]/20 bg-[#f433ab]/5 text-[#f472c8]"
          }`}
        >
          {message.text}
          <button
            onClick={() => setMessage(null)}
            className="ml-2 text-xs opacity-60 hover:opacity-100"
          >
            dismiss
          </button>
        </div>
      )}

      {creating && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3">
          <input
            type="text"
            placeholder="Snapshot label..."
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-brand-400 focus:outline-none"
          />
          <div className="flex items-center gap-1">
            <span className="mr-2 text-xs text-zinc-500">Include:</span>
            {(["tabs", "bookmarks", "both"] as SnapshotType[]).map((t) => (
              <button
                key={t}
                onClick={() => setNewType(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  newType === t
                    ? "bg-brand-500 text-coal"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={!newLabel.trim() || saving}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal hover:bg-brand-400 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save Snapshot"}
          </button>
        </div>
      )}

      {snapshots.length === 0 && !creating && (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 border border-zinc-800">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-zinc-600"
            >
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <circle cx="10" cy="10" r="3.5" />
              <circle cx="10" cy="10" r="1" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <p className="text-sm font-medium text-zinc-400">No snapshots yet</p>
          <p className="mt-1 max-w-[220px] text-[11px] text-zinc-600">
            Snapshots are created automatically before each apply, or you can create one manually.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {[...snapshots].reverse().map((snap) => {
          const isExpanded = expandedId === snap.id;
          const isRestoring = restoring === snap.id;

          return (
            <div key={snap.id} className="rounded-lg border border-zinc-800 bg-zinc-900">
              <button
                onClick={() => setExpandedId(isExpanded ? null : snap.id)}
                className="flex w-full items-center gap-2 p-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-200">{snap.label}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${TYPE_COLORS[snap.type]}`}
                    >
                      {TYPE_LABELS[snap.type]}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    <span>{timeAgo(snap.timestamp)}</span>
                    <span>·</span>
                    <span className={snap.source === "manual" ? "text-brand-400" : ""}>
                      {snap.source}
                    </span>
                    <span>·</span>
                    <span>
                      {snap.tabCount > 0 && `${snap.tabCount} tab${snap.tabCount !== 1 ? "s" : ""}`}
                      {snap.tabCount > 0 && snap.bookmarkCount > 0 && ", "}
                      {snap.bookmarkCount > 0 &&
                        `${snap.bookmarkCount} bookmark${snap.bookmarkCount !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                </div>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 10 10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 text-zinc-600 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                >
                  <path d="M3.5 2l3 3-3 3" />
                </svg>
              </button>

              {isExpanded && (
                <div className="space-y-2 border-t border-zinc-800 p-3">
                  {renamingId === snap.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(snap.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 focus:border-brand-400 focus:outline-none"
                      />
                      <button
                        onClick={() => handleRename(snap.id)}
                        disabled={!renameValue.trim()}
                        className="rounded-md bg-brand-500 px-2 py-1 text-xs font-medium text-coal hover:bg-brand-400 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setRenamingId(null)}
                        className="text-xs text-zinc-500 hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    {(snap.type === "tabs" || snap.type === "both") && (
                      <button
                        onClick={() => handleRestore(snap.id, "tabs")}
                        disabled={isRestoring}
                        className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/30 disabled:opacity-40"
                      >
                        {isRestoring ? "Restoring..." : "Restore Tabs"}
                      </button>
                    )}
                    {(snap.type === "bookmarks" || snap.type === "both") && (
                      <button
                        onClick={() => handleRestore(snap.id, "bookmarks")}
                        disabled={isRestoring}
                        className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/30 disabled:opacity-40"
                      >
                        {isRestoring ? "Restoring..." : "Restore Bookmarks"}
                      </button>
                    )}
                    {snap.type === "both" && (
                      <button
                        onClick={() => handleRestore(snap.id, "both")}
                        disabled={isRestoring}
                        className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-950/30 disabled:opacity-40"
                      >
                        {isRestoring ? "Restoring..." : "Restore All"}
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setRenamingId(snap.id);
                        setRenameValue(snap.label);
                      }}
                      className="rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleExport(snap)}
                      className="rounded-md px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                    >
                      Export
                    </button>

                    {confirmDeleteId === snap.id ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDelete(snap.id)}
                          className="rounded-md bg-[#f433ab] px-3 py-1.5 text-xs font-medium text-coal hover:bg-[#f472c8]"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(snap.id)}
                        className="rounded-md px-3 py-1.5 text-xs text-[#f433ab] transition-colors hover:bg-[#f433ab]/10"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
