import { STORAGE_KEYS, MAX_SNAPSHOTS } from "@/shared/constants";
import { DEFAULT_SETTINGS, type Settings, type LockedTabGroup, type LockedBookmarkFolder, type Snapshot } from "@/shared/types";

export async function getSettings(): Promise<Settings> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS] as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  settings: Partial<Settings>,
): Promise<void> {
  const current = await getSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: { ...current, ...settings },
  });
}

export async function getSessionData<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.session.get(key);
  return (result[key] as T) ?? null;
}

export async function setSessionData<T>(
  key: string,
  data: T,
): Promise<void> {
  await chrome.storage.session.set({ [key]: data });
}

export async function clearSessionData(key: string): Promise<void> {
  await chrome.storage.session.remove(key);
}

export async function getLockedTabGroups(): Promise<LockedTabGroup[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOCKED_TAB_GROUPS);
  return (result[STORAGE_KEYS.LOCKED_TAB_GROUPS] as LockedTabGroup[]) ?? [];
}

export async function getLockedBookmarkFolders(): Promise<LockedBookmarkFolder[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LOCKED_BOOKMARK_FOLDERS);
  return (result[STORAGE_KEYS.LOCKED_BOOKMARK_FOLDERS] as LockedBookmarkFolder[]) ?? [];
}

export async function saveLockedBookmarkFolders(
  folders: LockedBookmarkFolder[],
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCKED_BOOKMARK_FOLDERS]: folders,
  });
}

export async function saveLockedTabGroups(
  groups: LockedTabGroup[],
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOCKED_TAB_GROUPS]: groups,
  });
}

// ─── Snapshot History ─────────────────────────────────────────────────

export async function getSnapshotHistory(): Promise<Snapshot[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SNAPSHOT_HISTORY);
  return (result[STORAGE_KEYS.SNAPSHOT_HISTORY] as Snapshot[]) ?? [];
}

export async function addSnapshot(snapshot: Snapshot): Promise<void> {
  const history = await getSnapshotHistory();
  history.push(snapshot);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SNAPSHOT_HISTORY]: pruneSnapshots(history, MAX_SNAPSHOTS),
  });
}

export async function deleteSnapshot(id: string): Promise<void> {
  const history = await getSnapshotHistory();
  await chrome.storage.local.set({
    [STORAGE_KEYS.SNAPSHOT_HISTORY]: history.filter((s) => s.id !== id),
  });
}

export async function renameSnapshot(
  id: string,
  label: string,
): Promise<void> {
  const history = await getSnapshotHistory();
  const snap = history.find((s) => s.id === id);
  if (snap) {
    snap.label = label;
    await chrome.storage.local.set({
      [STORAGE_KEYS.SNAPSHOT_HISTORY]: history,
    });
  }
}

export async function importSnapshots(
  incoming: Snapshot[],
): Promise<number> {
  const history = await getSnapshotHistory();
  const existingIds = new Set(history.map((s) => s.id));
  const newSnapshots = incoming.filter((s) => !existingIds.has(s.id));
  if (newSnapshots.length === 0) return 0;
  const merged = [...history, ...newSnapshots];
  await chrome.storage.local.set({
    [STORAGE_KEYS.SNAPSHOT_HISTORY]: pruneSnapshots(merged, MAX_SNAPSHOTS),
  });
  return newSnapshots.length;
}

function pruneSnapshots(snapshots: Snapshot[], max: number): Snapshot[] {
  if (snapshots.length <= max) return snapshots;

  // Remove oldest auto-snapshots first, then oldest manual if still over
  const removeIds = new Set<string>();
  let toRemove = snapshots.length - max;

  const auto = snapshots
    .filter((s) => s.source === "auto")
    .sort((a, b) => a.timestamp - b.timestamp);
  for (const s of auto) {
    if (toRemove <= 0) break;
    removeIds.add(s.id);
    toRemove--;
  }

  if (toRemove > 0) {
    const manual = snapshots
      .filter((s) => s.source === "manual")
      .sort((a, b) => a.timestamp - b.timestamp);
    for (const s of manual) {
      if (toRemove <= 0) break;
      removeIds.add(s.id);
      toRemove--;
    }
  }

  return snapshots.filter((s) => !removeIds.has(s.id));
}
