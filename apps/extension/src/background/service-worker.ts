import type { Message, MessageResponse, ProgressUpdate } from "@/shared/messaging";
import type {
  Settings,
  TabInfo,
  TabOrganizationResult,
  TabGroupSuggestion,
  TabGroupSnapshot,
  TabSnapshot,
  LockedTabGroup,
  LockedBookmarkFolder,
  BookmarkInfo,
  BookmarkSnapshot,
  BookmarkOrganizationResult,
  BookmarkDuplicateGroup,
  LocationSuggestion,
  FolderInfo,
  Snapshot,
  SnapshotType,
} from "@/shared/types";
import {
  getSettings,
  saveSettings,
  setSessionData,
  getSessionData,
  clearSessionData,
  getLockedTabGroups,
  saveLockedTabGroups,
  getLockedBookmarkFolders,
  saveLockedBookmarkFolders,
  addSnapshot,
  getSnapshotHistory,
  deleteSnapshot,
  renameSnapshot,
  importSnapshots,
} from "@/core/storage";
import {
  queryAllTabs,
  queryTabGroups,
  createTabGroup,
  ungroupTabs,
  closeTabs,
  findDuplicatesByUrl,
  findStaleTabs,
  groupByDomain,
  domainToTabGroups,
  getLockedTabIds,
  resolveStaleLockedGroups,
} from "@/core/tabs";
import {
  getBookmarkTree,
  flattenBookmarks,
  extractFolders,
  buildFolderPathMap,
  findDuplicateBookmarksDetailed,
  snapshotBookmarks,
  moveBookmark,
  createFolder,
  removeBookmark,
  removeEmptyFolders,
  getDeepLockedBookmarkIds,
} from "@/core/bookmarks";
import { STORAGE_KEYS } from "@/shared/constants";
import { getAIProvider } from "@/ai/provider";
import { getCorrections, saveCorrections, appendExperimentLog, updateExperimentLog, getExperimentLogs } from "@/core/storage";
import { extractCorrections, mergeCorrections } from "@/core/corrections";

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Message handler for quick operations
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    console.log(`[vxrtx] Message received: action="${message.action}"`);
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: String(err) });
    });
    return true;
  },
);

// Port handler for long-running operations with progress
type ProgressSender = (current: number, total: number, msg: string) => void;

chrome.runtime.onConnect.addListener((port) => {
  console.log(`[vxrtx] Port connected: "${port.name}"`);
  if (port.name !== "long-running") return;

  port.onMessage.addListener(async (message: Message) => {
    console.log(`[vxrtx] Port message received: action="${message.action}"`);
    const sendProgress: ProgressSender = (current, total, msg) => {
      try {
        port.postMessage({
          type: "progress",
          current,
          total,
          message: msg,
        } satisfies ProgressUpdate);
      } catch {
        // Port may have disconnected
      }
    };

    try {
      let result: MessageResponse;
      const payload = message.payload as Record<string, unknown> | undefined;
      const granularity = payload?.granularity as number | undefined;

      switch (message.action) {
        case "organize-tabs":
          result = await handleOrganizeTabs(granularity, sendProgress);
          break;
        case "organize-bookmarks":
          result = await handleOrganizeBookmarks(granularity, sendProgress);
          break;
        default:
          result = await handleMessage(message);
      }
      try { port.postMessage(result); } catch { /* disconnected */ }
    } catch (err) {
      try { port.postMessage({ success: false, error: String(err) }); } catch { /* disconnected */ }
    }
  });
});

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.action) {
    case "get-settings":
      return { success: true, data: await getSettings() };

    case "save-settings":
      await saveSettings(message.payload as Partial<Settings>);
      return { success: true };

    case "organize-tabs":
      return await handleOrganizeTabs(
        (message.payload as { granularity?: number })?.granularity,
      );

    case "apply-tab-suggestions":
      return await handleApplyTabSuggestions(
        message.payload as TabOrganizationResult,
      );

    case "undo-tab-changes":
      return await handleUndoTabChanges();

    case "organize-bookmarks":
      return await handleOrganizeBookmarks(
        (message.payload as { granularity?: number })?.granularity,
      );

    case "find-duplicate-bookmarks":
      return await handleFindDuplicateBookmarks();

    case "suggest-bookmark-location":
      return await handleSuggestBookmarkLocation(
        message.payload as { bookmark: BookmarkInfo },
      );

    case "apply-bookmark-suggestions":
      return await handleApplyBookmarkSuggestions(
        message.payload as BookmarkApplyPayload,
      );

    case "undo-bookmark-changes":
      return await handleUndoBookmarkChanges();

    case "cleanup-empty-folders":
      return await handleCleanupEmptyFolders();

    case "get-locked-bookmark-folders":
      return { success: true, data: await getLockedBookmarkFolders() };

    case "lock-bookmark-folder":
      return await handleLockBookmarkFolder(
        message.payload as { folderId: string; title: string; path: string },
      );

    case "unlock-bookmark-folder":
      return await handleUnlockBookmarkFolder(
        message.payload as { folderId: string },
      );

    case "get-locked-tab-groups":
      return await handleGetLockedTabGroups();

    case "lock-tab-group":
      return await handleLockTabGroup(
        message.payload as { chromeGroupId: number },
      );

    case "unlock-tab-group":
      return await handleUnlockTabGroup(
        message.payload as { chromeGroupId: number },
      );

    case "get-snapshots":
      return { success: true, data: await getSnapshotHistory() };

    case "create-snapshot":
      return await handleCreateSnapshot(
        message.payload as { label: string; type: SnapshotType },
      );

    case "restore-snapshot":
      return await handleRestoreSnapshot(
        message.payload as { id: string; restoreType: SnapshotType },
      );

    case "delete-snapshot":
      await deleteSnapshot(
        (message.payload as { id: string }).id,
      );
      return { success: true };

    case "rename-snapshot": {
      const rp = message.payload as { id: string; label: string };
      await renameSnapshot(rp.id, rp.label);
      return { success: true };
    }

    case "import-snapshots": {
      const imported = await importSnapshots(
        (message.payload as { snapshots: Snapshot[] }).snapshots,
      );
      return { success: true, data: { imported } };
    }

    default:
      return { success: false, error: `Unknown action: ${message.action}` };
  }
}

// ─── Tab Organization ───────────────────────────────────────────────

async function handleOrganizeTabs(
  granularity?: number,
  sendProgress?: ProgressSender,
): Promise<MessageResponse<TabOrganizationResult>> {
  const settings = await getSettings();
  const allTabs = await queryAllTabs();
  const g = (granularity ?? 3) as import("@/shared/types").GroupingGranularity;

  sendProgress?.(1, 4, `Preparing ${allTabs.length} tabs...`);

  const snapshot: TabSnapshot[] = allTabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  // Filter out pinned tabs and tabs in locked groups
  const pinnedTabs = allTabs.filter((t) => t.pinned);
  const unpinnedTabs = allTabs.filter((t) => !t.pinned);

  const windowId = allTabs[0]?.windowId;
  const lockedGroups =
    windowId !== undefined ? await resolveLockedGroups(windowId) : [];
  const lockedTabIds = getLockedTabIds(lockedGroups, unpinnedTabs);
  const tabs = unpinnedTabs.filter((t) => !lockedTabIds.has(t.id));

  let result: TabOrganizationResult;

  if (tabs.length === 0) {
    result = {
      tabs: [],
      groups: [],
      stale: [],
      duplicates: [],
      reasoning: "No tabs to organize — all tabs are pinned or in locked groups.",
    };
  } else if (settings.aiTier === "secure") {
    result = ruleBasedOrganize(tabs, settings.staleDaysThreshold, g);
  } else {
    try {
      const modelLabel = settings.aiModelProvider === "openrouter"
        ? `OpenRouter (${settings.openrouterModel})`
        : settings.aiModelProvider;
      sendProgress?.(2, 4, `Sending ${tabs.length} tabs to ${modelLabel}...`);
      const provider = await getAIProvider();
      const corrections = await getCorrections();
      const onStatus = (msg: string) => sendProgress?.(2, 4, msg);
      const startTime = Date.now();
      const aiResult = await provider.organizeTabs(tabs, { granularity: g, corrections, guidance: settings.tabGuidance, onStatus });
      const latencyMs = Date.now() - startTime;
      sendProgress?.(3, 4, "Processing results...");
      // Store original AI groups for correction diff at apply time
      await setSessionData("vxrtx_ai_tab_groups", aiResult.groups);

      // Log experiment for A/B analysis
      const experimentId = crypto.randomUUID();
      await setSessionData("vxrtx_experiment_id", experimentId);
      await appendExperimentLog({
        id: experimentId,
        timestamp: Date.now(),
        variant: "default",
        model: modelLabel,
        itemCount: tabs.length,
        latencyMs,
        groupCount: aiResult.groups.length,
      });

      result = {
        tabs,
        groups: aiResult.groups,
        stale: aiResult.stale,
        duplicates: aiResult.duplicates,
        reasoning: aiResult.reasoning,
      };
    } catch (err) {
      console.warn("AI tab organization failed:", err);
      result = ruleBasedOrganize(tabs, settings.staleDaysThreshold, g);
      result.reasoning = `AI unavailable (${err instanceof Error ? err.message : String(err)}). ${result.reasoning}`;
    }
  }

  const exclusions: string[] = [];
  if (pinnedTabs.length > 0) exclusions.push(`${pinnedTabs.length} pinned tab(s) excluded`);
  if (lockedGroups.length > 0) exclusions.push(`${lockedGroups.length} locked group(s) excluded`);
  if (exclusions.length > 0) {
    result.reasoning = `${exclusions.join(". ")}. ${result.reasoning ?? ""}`;
  }

  sendProgress?.(4, 4, "Done");
  return { success: true, data: result };
}

async function handleApplyTabSuggestions(
  result: TabOrganizationResult,
): Promise<MessageResponse> {
  const tabs = await queryAllTabs();
  const windowId = tabs[0]?.windowId;
  if (windowId === undefined) {
    return { success: false, error: "No window found" };
  }

  // Resolve locked groups and build protected tab ID set (includes pinned)
  const pinnedTabIds = new Set(tabs.filter((t) => t.pinned).map((t) => t.id));
  const lockedGroups = await resolveLockedGroups(windowId);
  const lockedTabIds = getLockedTabIds(lockedGroups, tabs);
  const protectedTabIds = new Set([...pinnedTabIds, ...lockedTabIds]);

  const snapshot: TabSnapshot[] = tabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  // Capture group metadata (names + colors) for restore
  const liveGroups = windowId !== undefined ? await queryTabGroups(windowId) : [];
  const tabGroupSnapshots: TabGroupSnapshot[] = liveGroups.map((g) => ({
    groupId: g.id,
    title: g.title ?? "",
    color: g.color as import("@/shared/types").TabGroupColor,
  }));
  await setSessionData("vxrtx_tab_group_snapshot", tabGroupSnapshots);

  // Persistent auto-snapshot for history
  await addSnapshot({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: "tabs",
    label: "Before tab organization",
    source: "auto",
    tabCount: snapshot.length,
    bookmarkCount: 0,
    tabs: snapshot,
    tabGroups: tabGroupSnapshots,
    bookmarks: [],
  });

  const createdGroupIds: number[] = [];
  for (const group of result.groups) {
    const validTabIds = group.tabIds.filter(
      (id) => !protectedTabIds.has(id) && tabs.some((t) => t.id === id),
    );
    if (validTabIds.length === 0) continue;
    const groupId = await createTabGroup({ ...group, tabIds: validTabIds }, windowId);
    createdGroupIds.push(groupId);
  }

  // Collapse all newly created groups to reduce tab bar clutter
  for (const groupId of createdGroupIds) {
    try {
      await chrome.tabGroups.update(groupId, { collapsed: true });
    } catch {
      // Group may have been removed between creation and collapse
    }
  }

  if (result.stale.length > 0) {
    const validStale = result.stale.filter(
      (id) => !protectedTabIds.has(id) && tabs.some((t) => t.id === id),
    );
    if (validStale.length > 0) await closeTabs(validStale);
  }

  for (const dupSet of result.duplicates) {
    if (dupSet.length > 1) {
      const validDups = dupSet
        .slice(1)
        .filter(
          (id) => !protectedTabIds.has(id) && tabs.some((t) => t.id === id),
        );
      if (validDups.length > 0) await closeTabs(validDups);
    }
  }

  // Extract and store correction signals from AI suggestion vs. user-applied diff
  try {
    const aiGroups = await getSessionData<TabGroupSuggestion[]>("vxrtx_ai_tab_groups");
    if (aiGroups && aiGroups.length > 0) {
      const newCorrections = extractCorrections(aiGroups, result.groups, tabs);
      const editCount = newCorrections.filter((c) => c.source === "correction").length;

      if (newCorrections.length > 0) {
        const existing = await getCorrections();
        const merged = mergeCorrections(existing, newCorrections);
        await saveCorrections(merged);
        console.log(`[vxrtx] Saved ${newCorrections.length} correction signal(s), ${merged.length} total stored`);
      }

      // Update experiment log with edit count
      const experimentId = await getSessionData<string>("vxrtx_experiment_id");
      if (experimentId) {
        await updateExperimentLog(experimentId, { editCount });
        console.log(`[vxrtx] Experiment ${experimentId.slice(0, 8)}: ${editCount} edit(s)`);
        await clearSessionData("vxrtx_experiment_id");
      }

      await clearSessionData("vxrtx_ai_tab_groups");
    }
  } catch (err) {
    console.warn("[vxrtx] Failed to save corrections:", err);
  }

  return { success: true };
}

async function handleUndoTabChanges(): Promise<MessageResponse> {
  const snapshot = await getSessionData<TabSnapshot[]>(
    STORAGE_KEYS.TAB_SNAPSHOT,
  );
  if (!snapshot || snapshot.length === 0) {
    return { success: false, error: "No undo snapshot available" };
  }

  const currentTabs = await queryAllTabs();
  const windowId = currentTabs[0]?.windowId;

  // Resolve locked groups — their tabs must not be ungrouped or moved
  const lockedGroups =
    windowId !== undefined ? await resolveLockedGroups(windowId) : [];
  const lockedTabIds = getLockedTabIds(lockedGroups, currentTabs);

  // Ungroup all non-locked grouped tabs
  const groupedTabIds = currentTabs
    .filter((t) => t.groupId !== -1 && !lockedTabIds.has(t.id))
    .map((t) => t.id);
  if (groupedTabIds.length > 0) {
    await ungroupTabs(groupedTabIds);
  }

  // Re-group non-locked tabs from snapshot
  const groupMap = new Map<number, number[]>();
  for (const entry of snapshot) {
    if (entry.groupId !== -1 && !lockedTabIds.has(entry.id)) {
      const existing = groupMap.get(entry.groupId);
      if (existing) {
        existing.push(entry.id);
      } else {
        groupMap.set(entry.groupId, [entry.id]);
      }
    }
  }

  // Load group metadata saved at apply time
  const savedGroupMeta = await getSessionData<TabGroupSnapshot[]>("vxrtx_tab_group_snapshot");
  const groupMeta = new Map<number, TabGroupSnapshot>();
  if (savedGroupMeta) {
    for (const g of savedGroupMeta) {
      groupMeta.set(g.groupId, g);
    }
  }

  if (windowId !== undefined) {
    for (const [oldGroupId, tabIds] of groupMap) {
      const validIds = tabIds.filter((id) =>
        currentTabs.some((t) => t.id === id),
      );
      if (validIds.length > 0) {
        const newGroupId = await chrome.tabs.group({
          tabIds: validIds as [number, ...number[]],
          createProperties: { windowId },
        });
        const meta = groupMeta.get(oldGroupId);
        if (meta && (meta.title || meta.color)) {
          try {
            await chrome.tabGroups.update(newGroupId, {
              title: meta.title,
              color: meta.color as chrome.tabGroups.Color,
            });
          } catch { /* group may have been removed */ }
        }
      }
    }
  }

  await clearSessionData(STORAGE_KEYS.TAB_SNAPSHOT);

  // Mark the most recent experiment as undone
  try {
    const logs = await getExperimentLogs();
    if (logs.length > 0) {
      const latest = logs[logs.length - 1];
      await updateExperimentLog(latest.id, { undone: true });
    }
  } catch { /* non-critical */ }

  return { success: true };
}

function ruleBasedOrganize(
  tabs: TabInfo[],
  staleDays: number,
  granularity: import("@/shared/types").GroupingGranularity = 3,
): TabOrganizationResult {
  const domainMap = groupByDomain(tabs);
  // Lower granularity = larger minGroupSize (fewer groups)
  // 1=Broad → min 4, 2→min 3, 3=Balanced → min 2, 4→min 2, 5=Fine → min 1
  const minGroupSize = granularity <= 1 ? 4 : granularity <= 2 ? 3 : granularity <= 3 ? 2 : 1;
  const groups = domainToTabGroups(domainMap, minGroupSize);
  const duplicates = findDuplicatesByUrl(tabs);
  const stale = findStaleTabs(tabs, staleDays);

  return {
    tabs,
    groups,
    stale,
    duplicates,
    reasoning: "Grouped by domain (rule-based)",
  };
}

// ─── Tab Group Locking ──────────────────────────────────────────────

async function resolveLockedGroups(
  windowId: number,
): Promise<LockedTabGroup[]> {
  const stored = await getLockedTabGroups();
  if (stored.length === 0) return [];

  const liveGroups = await queryTabGroups(windowId);
  const { resolved, changed } = resolveStaleLockedGroups(stored, liveGroups);
  if (changed) await saveLockedTabGroups(resolved);
  return resolved;
}

async function handleGetLockedTabGroups(): Promise<
  MessageResponse<{ locked: LockedTabGroup[]; dormant: LockedTabGroup[] }>
> {
  const tabs = await queryAllTabs();
  const windowId = tabs[0]?.windowId;
  if (windowId === undefined) {
    return { success: true, data: { locked: [], dormant: [] } };
  }

  const stored = await getLockedTabGroups();
  if (stored.length === 0) {
    return { success: true, data: { locked: [], dormant: [] } };
  }

  const liveGroups = await queryTabGroups(windowId);
  const { resolved, changed } = resolveStaleLockedGroups(stored, liveGroups);
  if (changed) await saveLockedTabGroups(resolved);

  const liveIds = new Set(liveGroups.map((g) => g.id));
  const locked = resolved.filter((g) => liveIds.has(g.chromeGroupId));
  const dormant = resolved.filter((g) => !liveIds.has(g.chromeGroupId));

  return { success: true, data: { locked, dormant } };
}

async function handleLockTabGroup(
  payload: { chromeGroupId: number },
): Promise<MessageResponse> {
  try {
    const group = await chrome.tabGroups.get(payload.chromeGroupId);
    const stored = await getLockedTabGroups();

    // Don't double-lock
    if (stored.some((g) => g.chromeGroupId === payload.chromeGroupId)) {
      return { success: true };
    }

    const entry: LockedTabGroup = {
      chromeGroupId: payload.chromeGroupId,
      name: group.title ?? "",
      color: group.color as LockedTabGroup["color"],
      lockedAt: Date.now(),
    };
    await saveLockedTabGroups([...stored, entry]);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: `Failed to lock group: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function handleUnlockTabGroup(
  payload: { chromeGroupId: number },
): Promise<MessageResponse> {
  const stored = await getLockedTabGroups();
  await saveLockedTabGroups(
    stored.filter((g) => g.chromeGroupId !== payload.chromeGroupId),
  );
  return { success: true };
}

// ─── Bookmark Folder Locking ────────────────────────────────────────

async function handleLockBookmarkFolder(
  payload: { folderId: string; title: string; path: string },
): Promise<MessageResponse> {
  const stored = await getLockedBookmarkFolders();
  if (stored.some((f) => f.folderId === payload.folderId)) {
    return { success: true };
  }
  const entry: LockedBookmarkFolder = {
    folderId: payload.folderId,
    title: payload.title,
    path: payload.path,
    lockedAt: Date.now(),
  };
  await saveLockedBookmarkFolders([...stored, entry]);
  return { success: true };
}

async function handleUnlockBookmarkFolder(
  payload: { folderId: string },
): Promise<MessageResponse> {
  const stored = await getLockedBookmarkFolders();
  await saveLockedBookmarkFolders(
    stored.filter((f) => f.folderId !== payload.folderId),
  );
  return { success: true };
}

// ─── Bookmark Organization ──────────────────────────────────────────

interface BookmarkOrganizeResponse {
  bookmarks: BookmarkInfo[];
  folders: FolderInfo[];
  result: BookmarkOrganizationResult;
}

interface BookmarkDuplicateResponse {
  duplicates: BookmarkDuplicateGroup[];
  folderPaths: Record<string, string>;
}

interface BookmarkLocationResponse {
  suggestions: LocationSuggestion[];
}

interface BookmarkApplyPayload {
  moves: { bookmarkId: string; targetFolderId: string }[];
  newFolders: { name: string; parentId: string }[];
  removals: string[];
  cleanupEmptyFolders?: boolean;
}

async function handleOrganizeBookmarks(
  granularity?: number,
  sendProgress?: ProgressSender,
): Promise<MessageResponse<BookmarkOrganizeResponse>> {
  const settings = await getSettings();
  const g = (granularity ?? 3) as import("@/shared/types").GroupingGranularity;
  const tree = await getBookmarkTree();
  const allBookmarks = flattenBookmarks(tree);
  const folders = extractFolders(tree);

  // Snapshot for undo
  await setSessionData(
    STORAGE_KEYS.BOOKMARK_SNAPSHOT,
    snapshotBookmarks(allBookmarks),
  );

  // Filter out bookmarks in locked folders
  const lockedFolders = await getLockedBookmarkFolders();
  const lockedBookmarkIds = getDeepLockedBookmarkIds(lockedFolders, tree);
  const bookmarks = allBookmarks.filter((b) => !lockedBookmarkIds.has(b.id));

  sendProgress?.(1, 4, `Preparing ${bookmarks.length} bookmarks...`);

  if (settings.aiTier === "secure") {
    // Rule-based: no restructuring, just return current state
    return {
      success: true,
      data: {
        bookmarks,
        folders,
        result: {
          folders: [],
          moves: [],
          duplicates: [],
          newFolders: [],
          reasoning:
            "Local AI not yet available. Showing current bookmarks. Switch to Relaxed/YOLO tier for AI-powered organization.",
        },
      },
    };
  }

  const modelLabel = settings.aiModelProvider === "openrouter"
    ? `OpenRouter (${settings.openrouterModel})`
    : settings.aiModelProvider;

  try {
    const provider = await getAIProvider();
    const BATCH_SIZE = 100;
    const startTime = Date.now();

    if (bookmarks.length <= BATCH_SIZE) {
      // Small enough for a single call
      console.log(`[vxrtx] Bookmark organize: ${bookmarks.length} bookmarks (single batch), model=${modelLabel}, granularity=${g}`);
      sendProgress?.(2, 4, `Sending ${bookmarks.length} bookmarks to ${modelLabel}...`);
      const onStatus = (msg: string) => sendProgress?.(2, 4, msg);
      const aiResult = await provider.organizeBookmarks(bookmarks, { granularity: g, guidance: settings.bookmarkGuidance, onStatus });
      console.log(`[vxrtx] Bookmark organize complete: ${((Date.now() - startTime) / 1000).toFixed(1)}s, ${aiResult.folders.length} folders`);
      sendProgress?.(3, 4, "Processing results...");
      return { success: true, data: { bookmarks, folders, result: aiResult } };
    }

    // Batch processing for large collections
    const batches: BookmarkInfo[][] = [];
    for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
      batches.push(bookmarks.slice(i, i + BATCH_SIZE));
    }
    console.log(`[vxrtx] Bookmark organize: ${bookmarks.length} bookmarks in ${batches.length} batches, model=${modelLabel}, granularity=${g}`);

    const allFolders: Map<string, string[]> = new Map(); // lowercased path → bookmarkIds
    const nameMap = new Map<string, string>(); // lowercased path → first-seen original casing
    const allDuplicates: string[][] = [];
    const reasonings: string[] = [];

    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi];
      sendProgress?.(bi + 1, batches.length + 1, `Batch ${bi + 1}/${batches.length}: analyzing ${batch.length} bookmarks...`);
      console.log(`[vxrtx] Batch ${bi + 1}/${batches.length}: ${batch.length} bookmarks`);

      try {
        const onStatus = (msg: string) => sendProgress?.(bi + 1, batches.length + 1, msg);
        const batchResult = await provider.organizeBookmarks(batch, { granularity: g, guidance: settings.bookmarkGuidance, onStatus });

        // Merge folders: consolidate by path (case-insensitive)
        for (const folder of batchResult.folders) {
          const key = folder.name.toLowerCase().trim();
          if (!nameMap.has(key)) {
            nameMap.set(key, folder.name); // preserve first-seen casing
          }
          const existing = allFolders.get(key);
          if (existing) {
            existing.push(...folder.bookmarkIds);
          } else {
            allFolders.set(key, [...folder.bookmarkIds]);
          }
        }
        if (batchResult.duplicates.length > 0) {
          allDuplicates.push(...batchResult.duplicates);
        }
        if (batchResult.reasoning) {
          reasonings.push(batchResult.reasoning);
        }
      } catch (batchErr) {
        console.warn(`[vxrtx] Batch ${bi + 1} failed:`, batchErr);
        reasonings.push(`Batch ${bi + 1} failed: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`);
      }
    }

    // Build merged result using first-seen casing for folder names
    const mergedFolders = Array.from(allFolders.entries()).map(([key, bookmarkIds]) => ({
      name: nameMap.get(key) ?? key,
      bookmarkIds,
      parentId: undefined as string | undefined,
    }));

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[vxrtx] Bookmark organize complete: ${elapsed}s, ${mergedFolders.length} folders from ${batches.length} batches`);
    sendProgress?.(batches.length + 1, batches.length + 1, "Done");

    return {
      success: true,
      data: {
        bookmarks,
        folders,
        result: {
          folders: mergedFolders,
          moves: [],
          duplicates: allDuplicates,
          newFolders: [],
          reasoning: `Processed ${bookmarks.length} bookmarks in ${batches.length} batches (${elapsed}s). ${reasonings[0] ?? ""}`,
        },
      },
    };
  } catch (err) {
    console.error("[vxrtx] Bookmark organize FAILED:", err);
    return {
      success: true,
      data: {
        bookmarks,
        folders,
        result: {
          folders: [],
          moves: [],
          duplicates: [],
          newFolders: [],
          reasoning: `AI unavailable (${err instanceof Error ? err.message : String(err)}). Showing current bookmarks.`,
        },
      },
    };
  }
}

async function handleFindDuplicateBookmarks(): Promise<
  MessageResponse<BookmarkDuplicateResponse>
> {
  const tree = await getBookmarkTree();
  const allBookmarks = flattenBookmarks(tree);
  const folderPathMap = buildFolderPathMap(tree);

  // Filter out bookmarks in locked folders
  const lockedFolders = await getLockedBookmarkFolders();
  const lockedBookmarkIds = getDeepLockedBookmarkIds(lockedFolders, tree);
  const bookmarks = allBookmarks.filter((b) => !lockedBookmarkIds.has(b.id));

  const duplicates = findDuplicateBookmarksDetailed(bookmarks);

  const folderPaths: Record<string, string> = {};
  for (const [id, path] of folderPathMap) {
    folderPaths[id] = path;
  }

  // Snapshot for undo
  await setSessionData(
    STORAGE_KEYS.BOOKMARK_SNAPSHOT,
    snapshotBookmarks(bookmarks),
  );

  return { success: true, data: { duplicates, folderPaths } };
}

async function handleSuggestBookmarkLocation(
  payload: { bookmark: BookmarkInfo },
): Promise<MessageResponse<BookmarkLocationResponse>> {
  const settings = await getSettings();

  if (settings.aiTier === "secure") {
    return {
      success: false,
      error:
        "Local AI not yet available for bookmark suggestions. Switch to Relaxed/YOLO tier.",
    };
  }

  const tree = await getBookmarkTree();
  const folders = extractFolders(tree);
  const folderInput = folders.map((f) => ({ id: f.id, path: f.path }));

  try {
    const provider = await getAIProvider();
    const suggestions = await provider.suggestBookmarkLocation(
      payload.bookmark,
      folderInput,
    );
    return { success: true, data: { suggestions } };
  } catch (err) {
    return {
      success: false,
      error: `AI suggestion failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Create a nested folder path like "Dev/Frontend". Splits on "/", creates
 * intermediate folders, and returns the leaf folder's ID. Uses a cache to
 * avoid creating duplicate parents within the same apply operation.
 */
async function createFolderPath(
  path: string,
  rootParentId: string,
  cache: Map<string, string>,
): Promise<string> {
  const segments = path.split("/").map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return rootParentId;

  let currentParentId = rootParentId;
  let currentPath = "";

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const cacheKey = `${currentPath.toLowerCase()}:${rootParentId}`;

    const cached = cache.get(cacheKey);
    if (cached) {
      currentParentId = cached;
      continue;
    }

    const created = await createFolder(segment, currentParentId);
    cache.set(cacheKey, created.id);
    currentParentId = created.id;
  }

  return currentParentId;
}

async function handleApplyBookmarkSuggestions(
  payload: BookmarkApplyPayload,
): Promise<MessageResponse> {
  console.log(`[vxrtx] Applying bookmark suggestions: ${payload.moves.length} moves, ${payload.newFolders.length} new folders, ${payload.removals.length} removals`);

  // Re-snapshot before applying
  const tree = await getBookmarkTree();
  const bookmarks = flattenBookmarks(tree);
  const bmSnapshot = snapshotBookmarks(bookmarks);
  console.log(`[vxrtx] Bookmark snapshot: ${bmSnapshot.length} entries`);

  try {
    await setSessionData(STORAGE_KEYS.BOOKMARK_SNAPSHOT, bmSnapshot);
  } catch (err) {
    console.error("[vxrtx] Failed to save session snapshot:", err);
  }

  // Persistent auto-snapshot for history
  try {
    await addSnapshot({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      type: "bookmarks",
      label: "Before bookmark organization",
      source: "auto",
      tabCount: 0,
      bookmarkCount: bmSnapshot.length,
      tabs: [],
      bookmarks: bmSnapshot,
    });
    console.log(`[vxrtx] Auto-snapshot saved to history`);
  } catch (err) {
    console.error("[vxrtx] Failed to save auto-snapshot:", err);
  }

  // Build locked set so we never move/remove locked bookmarks
  const lockedFolders = await getLockedBookmarkFolders();
  const lockedBookmarkIds = getDeepLockedBookmarkIds(lockedFolders, tree);

  // Create new folders (with hierarchical path support) and build a map of placeholder → real ID
  const folderIdMap = new Map<string, string>();
  const folderPathCache = new Map<string, string>(); // cache to avoid duplicate intermediate folders
  for (const folder of payload.newFolders) {
    const leafId = await createFolderPath(folder.name, folder.parentId, folderPathCache);
    folderIdMap.set(`${folder.name}:${folder.parentId}`, leafId);
  }

  // Apply moves (skip locked bookmarks)
  for (const move of payload.moves) {
    if (lockedBookmarkIds.has(move.bookmarkId)) continue;
    const resolvedFolderId =
      folderIdMap.get(move.targetFolderId) ?? move.targetFolderId;
    try {
      await moveBookmark(move.bookmarkId, { parentId: resolvedFolderId });
    } catch (err) {
      console.warn(`Failed to move bookmark ${move.bookmarkId}:`, err);
    }
  }

  // Remove duplicates (skip locked bookmarks)
  for (const id of payload.removals) {
    if (lockedBookmarkIds.has(id)) continue;
    try {
      await removeBookmark(id);
    } catch (err) {
      console.warn(`Failed to remove bookmark ${id}:`, err);
    }
  }

  // Clean up empty folders left behind by moves/removals
  if (payload.cleanupEmptyFolders !== false) {
    const removed = await removeEmptyFolders();
    return { success: true, data: { emptyFoldersRemoved: removed } };
  }

  return { success: true };
}

async function handleCleanupEmptyFolders(): Promise<MessageResponse> {
  const removed = await removeEmptyFolders();
  return {
    success: true,
    data: { removed },
  };
}

async function handleUndoBookmarkChanges(): Promise<MessageResponse> {
  const snapshot = await getSessionData<BookmarkSnapshot[]>(
    STORAGE_KEYS.BOOKMARK_SNAPSHOT,
  );
  if (!snapshot || snapshot.length === 0) {
    return { success: false, error: "No undo snapshot available" };
  }

  // Restore each bookmark to its original position
  for (const entry of snapshot) {
    try {
      await moveBookmark(entry.id, {
        parentId: entry.parentId,
        index: entry.index,
      });
    } catch {
      // Bookmark may have been deleted, skip
    }
  }

  await clearSessionData(STORAGE_KEYS.BOOKMARK_SNAPSHOT);
  return { success: true };
}

// ─── Snapshot Management ──────────────────────────────────────────────

async function handleCreateSnapshot(
  payload: { label: string; type: SnapshotType },
): Promise<MessageResponse> {
  let tabs: TabSnapshot[] = [];
  let tabGroups: TabGroupSnapshot[] = [];
  let bmSnapshots: BookmarkSnapshot[] = [];

  if (payload.type === "tabs" || payload.type === "both") {
    const allTabs = await queryAllTabs();
    tabs = allTabs.map((t) => ({
      id: t.id,
      groupId: t.groupId,
      windowId: t.windowId,
    }));
    const windowId = allTabs[0]?.windowId;
    if (windowId !== undefined) {
      const liveGroups = await queryTabGroups(windowId);
      tabGroups = liveGroups.map((g) => ({
        groupId: g.id,
        title: g.title ?? "",
        color: g.color as import("@/shared/types").TabGroupColor,
      }));
    }
  }

  if (payload.type === "bookmarks" || payload.type === "both") {
    const tree = await getBookmarkTree();
    const allBookmarks = flattenBookmarks(tree);
    bmSnapshots = snapshotBookmarks(allBookmarks);
  }

  await addSnapshot({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    type: payload.type,
    label: payload.label,
    source: "manual",
    tabCount: tabs.length,
    bookmarkCount: bmSnapshots.length,
    tabs,
    tabGroups: tabGroups.length > 0 ? tabGroups : undefined,
    bookmarks: bmSnapshots,
  });

  return { success: true };
}

async function handleRestoreSnapshot(
  payload: { id: string; restoreType: SnapshotType },
): Promise<MessageResponse<{ tabsRestored: number; tabsSkipped: number; bookmarksRestored: number; bookmarksSkipped: number }>> {
  const history = await getSnapshotHistory();
  const snapshot = history.find((s) => s.id === payload.id);
  if (!snapshot) {
    return { success: false, error: "Snapshot not found" };
  }

  let tabsRestored = 0;
  let tabsSkipped = 0;
  let bookmarksRestored = 0;
  let bookmarksSkipped = 0;

  // Restore tabs
  if (
    (payload.restoreType === "tabs" || payload.restoreType === "both") &&
    snapshot.tabs.length > 0
  ) {
    const currentTabs = await queryAllTabs();
    const windowId = currentTabs[0]?.windowId;

    const lockedGroups =
      windowId !== undefined ? await resolveLockedGroups(windowId) : [];
    const lockedTabIds = getLockedTabIds(lockedGroups, currentTabs);

    // Ungroup all non-locked grouped tabs
    const groupedTabIds = currentTabs
      .filter((t) => t.groupId !== -1 && !lockedTabIds.has(t.id))
      .map((t) => t.id);
    if (groupedTabIds.length > 0) {
      await ungroupTabs(groupedTabIds);
    }

    // Re-group from snapshot
    const groupMap = new Map<number, number[]>();
    for (const entry of snapshot.tabs) {
      if (entry.groupId !== -1 && !lockedTabIds.has(entry.id)) {
        const existing = groupMap.get(entry.groupId);
        if (existing) {
          existing.push(entry.id);
        } else {
          groupMap.set(entry.groupId, [entry.id]);
        }
      }
    }

    // Build lookup for group metadata (name + color)
    const groupMeta = new Map<number, TabGroupSnapshot>();
    if (snapshot.tabGroups) {
      for (const g of snapshot.tabGroups) {
        groupMeta.set(g.groupId, g);
      }
    }

    if (windowId !== undefined) {
      for (const [oldGroupId, tabIds] of groupMap) {
        const validIds = tabIds.filter((id) =>
          currentTabs.some((t) => t.id === id),
        );
        tabsRestored += validIds.length;
        tabsSkipped += tabIds.length - validIds.length;
        if (validIds.length > 0) {
          const newGroupId = await chrome.tabs.group({
            tabIds: validIds as [number, ...number[]],
            createProperties: { windowId },
          });
          // Restore group name and color if we have metadata
          const meta = groupMeta.get(oldGroupId);
          if (meta && (meta.title || meta.color)) {
            try {
              await chrome.tabGroups.update(newGroupId, {
                title: meta.title,
                color: meta.color as chrome.tabGroups.Color,
              });
            } catch {
              // Group may have been removed between creation and update
            }
          }
        }
      }
    }
  }

  // Restore bookmarks
  if (
    (payload.restoreType === "bookmarks" || payload.restoreType === "both") &&
    snapshot.bookmarks.length > 0
  ) {
    for (const entry of snapshot.bookmarks) {
      try {
        await moveBookmark(entry.id, {
          parentId: entry.parentId,
          index: entry.index,
        });
        bookmarksRestored++;
      } catch {
        bookmarksSkipped++;
      }
    }
  }

  return {
    success: true,
    data: { tabsRestored, tabsSkipped, bookmarksRestored, bookmarksSkipped },
  };
}
