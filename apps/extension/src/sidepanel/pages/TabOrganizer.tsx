import { useState, useCallback, useEffect } from "react";
import { sendMessage } from "@/shared/messaging";
import type {
  TabOrganizationResult,
  TabGroupSuggestion,
  TabGroupColor,
  TabInfo,
  LockedTabGroup,
} from "@/shared/types";

type Status = "idle" | "loading" | "preview" | "applying" | "done";

interface EditableGroup extends TabGroupSuggestion {
  enabled: boolean;
}

interface PreviewState {
  groups: EditableGroup[];
  staleEnabled: Set<number>;
  duplicatesEnabled: Set<number>;
  tabs: Map<number, TabInfo>;
  reasoning?: string;
  allDuplicates: number[][];
}

interface ChromeGroup {
  id: number;
  title: string;
  color: TabGroupColor;
  tabCount: number;
}

const GROUP_COLORS: TabGroupColor[] = [
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "purple",
  "cyan",
  "orange",
  "grey",
];

export function TabOrganizer() {
  const [status, setStatus] = useState<Status>("idle");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);

  // Lock state
  const [chromeGroups, setChromeGroups] = useState<ChromeGroup[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<number>>(new Set());
  const [dormantLocks, setDormantLocks] = useState<LockedTabGroup[]>([]);

  // Load current Chrome groups + locked state on mount and when returning to idle
  useEffect(() => {
    if (status === "idle") loadGroupsAndLocks();
  }, [status]);

  async function loadGroupsAndLocks() {
    try {
      // Get current tabs to find windowId and count tabs per group
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const windowId = tabs[0]?.windowId;
      if (windowId === undefined) return;

      const groups = await chrome.tabGroups.query({ windowId });
      const tabCountByGroup = new Map<number, number>();
      for (const tab of tabs) {
        if (tab.groupId !== undefined && tab.groupId !== -1) {
          tabCountByGroup.set(
            tab.groupId,
            (tabCountByGroup.get(tab.groupId) ?? 0) + 1,
          );
        }
      }

      setChromeGroups(
        groups.map((g) => ({
          id: g.id,
          title: g.title ?? "",
          color: g.color as TabGroupColor,
          tabCount: tabCountByGroup.get(g.id) ?? 0,
        })),
      );

      // Load locked groups
      const lockRes = await sendMessage<
        void,
        { locked: LockedTabGroup[]; dormant: LockedTabGroup[] }
      >("get-locked-tab-groups");
      if (lockRes.success && lockRes.data) {
        setLockedIds(
          new Set(lockRes.data.locked.map((g) => g.chromeGroupId)),
        );
        setDormantLocks(lockRes.data.dormant);
      }
    } catch {
      // Side panel may not have access yet
    }
  }

  async function handleLock(groupId: number) {
    const res = await sendMessage("lock-tab-group", {
      chromeGroupId: groupId,
    });
    if (res.success) {
      setLockedIds((prev) => new Set([...prev, groupId]));
    }
  }

  async function handleUnlock(groupId: number) {
    const res = await sendMessage("unlock-tab-group", {
      chromeGroupId: groupId,
    });
    if (res.success) {
      setLockedIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    }
  }

  async function handleRemoveDormantLock(lock: LockedTabGroup) {
    await sendMessage("unlock-tab-group", {
      chromeGroupId: lock.chromeGroupId,
    });
    setDormantLocks((prev) =>
      prev.filter((l) => l.chromeGroupId !== lock.chromeGroupId),
    );
  }

  async function handleOrganize() {
    setStatus("loading");
    setError(null);
    try {
      const response = await sendMessage<void, TabOrganizationResult>(
        "organize-tabs",
      );
      if (response.success && response.data) {
        const data = response.data;
        const tabMap = new Map(data.tabs.map((t) => [t.id, t]));

        setPreview({
          groups: data.groups.map((g) => ({ ...g, enabled: true })),
          staleEnabled: new Set(data.stale),
          duplicatesEnabled: new Set(
            data.duplicates.flatMap((set) => set.slice(1)),
          ),
          tabs: tabMap,
          reasoning: data.reasoning,
          allDuplicates: data.duplicates,
        });
        setStatus("preview");
      } else {
        setError(response.error ?? "Failed to organize tabs");
        setStatus("idle");
      }
    } catch (err) {
      setError(String(err));
      setStatus("idle");
    }
  }

  async function handleApply() {
    if (!preview) return;
    setStatus("applying");
    try {
      const result: TabOrganizationResult = {
        tabs: Array.from(preview.tabs.values()),
        groups: preview.groups
          .filter((g) => g.enabled && g.tabIds.length > 0)
          .map(({ enabled: _, ...g }) => g),
        stale: Array.from(preview.staleEnabled),
        duplicates: preview.allDuplicates
          .map((set) =>
            set.filter((id) => preview.duplicatesEnabled.has(id)),
          )
          .filter((set) => set.length > 0)
          .map((toClose) => [0, ...toClose]),
        reasoning: preview.reasoning,
      };

      const response = await sendMessage("apply-tab-suggestions", result);
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
    try {
      const response = await sendMessage("undo-tab-changes");
      if (response.success) {
        setUndoAvailable(false);
        setPreview(null);
        setStatus("idle");
      } else {
        setError(response.error ?? "Undo failed");
      }
    } catch (err) {
      setError(String(err));
    }
  }

  function handleCancel() {
    setPreview(null);
    setStatus("idle");
  }

  function handleReset() {
    setPreview(null);
    setError(null);
    setStatus("idle");
  }

  const toggleGroup = useCallback((index: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const groups = [...prev.groups];
      groups[index] = { ...groups[index], enabled: !groups[index].enabled };
      return { ...prev, groups };
    });
  }, []);

  const updateGroupName = useCallback((index: number, name: string) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const groups = [...prev.groups];
      groups[index] = { ...groups[index], name };
      return { ...prev, groups };
    });
  }, []);

  const updateGroupColor = useCallback(
    (index: number, color: TabGroupColor) => {
      setPreview((prev) => {
        if (!prev) return prev;
        const groups = [...prev.groups];
        groups[index] = { ...groups[index], color };
        return { ...prev, groups };
      });
    },
    [],
  );

  const removeTabFromGroup = useCallback(
    (groupIndex: number, tabId: number) => {
      setPreview((prev) => {
        if (!prev) return prev;
        const groups = [...prev.groups];
        groups[groupIndex] = {
          ...groups[groupIndex],
          tabIds: groups[groupIndex].tabIds.filter((id) => id !== tabId),
        };
        return { ...prev, groups };
      });
    },
    [],
  );

  const toggleStaleTab = useCallback((tabId: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const staleEnabled = new Set(prev.staleEnabled);
      if (staleEnabled.has(tabId)) {
        staleEnabled.delete(tabId);
      } else {
        staleEnabled.add(tabId);
      }
      return { ...prev, staleEnabled };
    });
  }, []);

  const toggleDuplicateTab = useCallback((tabId: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const duplicatesEnabled = new Set(prev.duplicatesEnabled);
      if (duplicatesEnabled.has(tabId)) {
        duplicatesEnabled.delete(tabId);
      } else {
        duplicatesEnabled.add(tabId);
      }
      return { ...prev, duplicatesEnabled };
    });
  }, []);

  const enabledCount =
    preview
      ? preview.groups.filter((g) => g.enabled).length +
        preview.staleEnabled.size +
        preview.duplicatesEnabled.size
      : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Tab Organizer</h2>
        {status === "idle" && (
          <button
            onClick={handleOrganize}
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal transition-colors hover:bg-brand-400"
          >
            Organize Tabs
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Idle state: show current groups with lock toggles */}
      {status === "idle" && chromeGroups.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium text-zinc-300">
            Tab Groups
            {lockedIds.size > 0 && (
              <span className="ml-1 text-xs text-zinc-500">
                ({lockedIds.size} locked)
              </span>
            )}
          </h3>
          {chromeGroups.map((group) => {
            const isLocked = lockedIds.has(group.id);
            return (
              <div
                key={group.id}
                className={`flex items-center gap-2 rounded-lg border p-2.5 transition-colors ${
                  isLocked
                    ? "border-amber-800/50 bg-amber-950/10"
                    : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <div
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: colorToHex(group.color) }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-200">
                  {group.title || "Untitled"}
                </span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {group.tabCount} tab{group.tabCount !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() =>
                    isLocked
                      ? handleUnlock(group.id)
                      : handleLock(group.id)
                  }
                  className={`shrink-0 px-1 text-sm transition-colors ${
                    isLocked
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-zinc-600 hover:text-zinc-400"
                  }`}
                  title={isLocked ? "Unlock group" : "Lock group"}
                >
                  {isLocked ? "🔒" : "🔓"}
                </button>
              </div>
            );
          })}

          {/* Dormant locks */}
          {dormantLocks.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-zinc-600">
                Dormant locks (group no longer open):
              </p>
              {dormantLocks.map((lock) => (
                <div
                  key={lock.chromeGroupId}
                  className="flex items-center gap-2 rounded-md border border-zinc-800/50 bg-zinc-900/30 px-2.5 py-1.5"
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full opacity-40"
                    style={{ backgroundColor: colorToHex(lock.color) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-500">
                    {lock.name || "Untitled"}
                  </span>
                  <button
                    onClick={() => handleRemoveDormantLock(lock)}
                    className="shrink-0 text-[10px] text-zinc-600 hover:text-red-400"
                  >
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {status === "idle" && !error && chromeGroups.length === 0 && (
        <p className="text-sm text-zinc-500">
          Click "Organize Tabs" to analyze and group your open tabs.
        </p>
      )}

      {status === "idle" && !error && chromeGroups.length > 0 && (
        <p className="text-xs text-zinc-600">
          Locked groups are excluded from all organization. Click "Organize
          Tabs" to analyze unlocked tabs.
        </p>
      )}

      {status === "loading" && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          Analyzing tabs...
        </div>
      )}

      {status === "preview" && preview && (
        <div className="space-y-4">
          {preview.reasoning && (
            <p className="text-xs text-zinc-500">{preview.reasoning}</p>
          )}

          {/* Groups */}
          {preview.groups.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">
                Suggested Groups
              </h3>
              {preview.groups.map((group, gi) => (
                <GroupCard
                  key={gi}
                  group={group}
                  index={gi}
                  tabs={preview.tabs}
                  onToggle={toggleGroup}
                  onRename={updateGroupName}
                  onChangeColor={updateGroupColor}
                  onRemoveTab={removeTabFromGroup}
                />
              ))}
            </section>
          )}

          {/* Stale tabs */}
          {preview.staleEnabled.size > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">
                Stale Tabs
                <span className="ml-1 text-xs text-zinc-500">
                  (close {preview.staleEnabled.size})
                </span>
              </h3>
              {Array.from(
                new Set([
                  ...preview.staleEnabled,
                  ...Array.from(preview.tabs.keys()).filter((id) =>
                    preview.staleEnabled.has(id),
                  ),
                ]),
              ).map((tabId) => {
                const tab = preview.tabs.get(tabId);
                if (!tab) return null;
                return (
                  <TabCheckbox
                    key={tabId}
                    tab={tab}
                    checked={preview.staleEnabled.has(tabId)}
                    onToggle={() => toggleStaleTab(tabId)}
                    label="close"
                  />
                );
              })}
            </section>
          )}

          {/* Duplicates */}
          {preview.allDuplicates.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-medium text-zinc-300">
                Duplicates
                <span className="ml-1 text-xs text-zinc-500">
                  ({preview.allDuplicates.length} set
                  {preview.allDuplicates.length > 1 ? "s" : ""})
                </span>
              </h3>
              {preview.allDuplicates.map((dupSet, di) => (
                <div
                  key={di}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2"
                >
                  {dupSet.map((tabId, ti) => {
                    const tab = preview.tabs.get(tabId);
                    if (!tab) return null;
                    if (ti === 0) {
                      return (
                        <div
                          key={tabId}
                          className="flex items-center gap-2 px-2 py-1"
                        >
                          <Favicon url={tab.favIconUrl} />
                          <span className="truncate text-xs text-zinc-300">
                            {tab.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-green-500">
                            keep
                          </span>
                        </div>
                      );
                    }
                    return (
                      <TabCheckbox
                        key={tabId}
                        tab={tab}
                        checked={preview.duplicatesEnabled.has(tabId)}
                        onToggle={() => toggleDuplicateTab(tabId)}
                        label="close"
                      />
                    );
                  })}
                </div>
              ))}
            </section>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 border-t border-zinc-800 pt-3">
            <button
              onClick={handleApply}
              disabled={enabledCount === 0}
              className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-coal transition-colors hover:bg-brand-400 disabled:opacity-40 disabled:hover:bg-brand-500"
            >
              Apply ({enabledCount})
            </button>
            <button
              onClick={handleCancel}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "applying" && (
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Spinner />
          Applying changes...
        </div>
      )}

      {status === "done" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-green-800 bg-green-950/50 p-3 text-sm text-green-300">
            Tabs organized successfully!
          </div>
          <div className="flex gap-2">
            {undoAvailable && (
              <button
                onClick={handleUndo}
                className="rounded-lg border border-amber-700 px-4 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-950/30"
              >
                Undo
              </button>
            )}
            <button
              onClick={handleReset}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function Spinner() {
  return (
    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-brand-400" />
  );
}

function Favicon({ url }: { url?: string }) {
  if (!url) {
    return <div className="h-4 w-4 shrink-0 rounded bg-zinc-700" />;
  }
  return (
    <img
      src={url}
      alt=""
      className="h-4 w-4 shrink-0 rounded"
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function TabCheckbox({
  tab,
  checked,
  onToggle,
  label,
}: {
  tab: TabInfo;
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-zinc-800/50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 text-brand-400 accent-brand-400"
      />
      <Favicon url={tab.favIconUrl} />
      <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
        {tab.title}
      </span>
      <span className="shrink-0 text-[10px] text-zinc-600">{label}</span>
    </label>
  );
}

function GroupCard({
  group,
  index,
  tabs,
  onToggle,
  onRename,
  onChangeColor,
  onRemoveTab,
}: {
  group: EditableGroup;
  index: number;
  tabs: Map<number, TabInfo>;
  onToggle: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onChangeColor: (index: number, color: TabGroupColor) => void;
  onRemoveTab: (groupIndex: number, tabId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingName, setEditingName] = useState(false);

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        group.enabled
          ? "border-zinc-700 bg-zinc-900"
          : "border-zinc-800/50 bg-zinc-900/30 opacity-50"
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={group.enabled}
          onChange={() => onToggle(index)}
          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800 accent-brand-400"
        />

        {/* Color picker */}
        <button
          onClick={() => {
            const currentIdx = GROUP_COLORS.indexOf(group.color);
            const nextColor =
              GROUP_COLORS[(currentIdx + 1) % GROUP_COLORS.length];
            onChangeColor(index, nextColor);
          }}
          className="h-3.5 w-3.5 shrink-0 rounded-full border border-zinc-600 transition-transform hover:scale-125"
          style={{ backgroundColor: colorToHex(group.color) }}
          title={`Color: ${group.color} (click to cycle)`}
        />

        {/* Editable name */}
        {editingName ? (
          <input
            type="text"
            value={group.name}
            onChange={(e) => onRename(index, e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            autoFocus
            className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-800 px-1.5 py-0.5 text-sm text-zinc-100 outline-none focus:border-brand-400"
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium text-zinc-100 hover:text-brand-400"
            title="Click to rename"
          >
            {group.name}
          </button>
        )}

        <span className="shrink-0 text-xs text-zinc-500">
          {group.tabIds.length} tab{group.tabIds.length !== 1 ? "s" : ""}
        </span>

        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-0.5 border-t border-zinc-800 pt-2">
          {group.tabIds.map((tabId) => {
            const tab = tabs.get(tabId);
            if (!tab) return null;
            return (
              <div
                key={tabId}
                className="flex items-center gap-2 rounded-md px-1 py-0.5 hover:bg-zinc-800/50"
              >
                <Favicon url={tab.favIconUrl} />
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  {tab.title}
                </span>
                <button
                  onClick={() => onRemoveTab(index, tabId)}
                  className="shrink-0 text-xs text-zinc-600 hover:text-red-400"
                  title="Remove from group"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function colorToHex(color: string): string {
  const map: Record<string, string> = {
    grey: "#6b7280",
    blue: "#3b82f6",
    red: "#ef4444",
    yellow: "#eab308",
    green: "#22c55e",
    pink: "#ec4899",
    purple: "#a855f7",
    cyan: "#06b6d4",
    orange: "#f97316",
  };
  return map[color] ?? "#6b7280";
}
