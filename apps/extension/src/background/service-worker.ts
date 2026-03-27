import type { Message, MessageResponse } from "@/shared/messaging";
import type {
  Settings,
  TabInfo,
  TabOrganizationResult,
  TabSnapshot,
  LockedTabGroup,
  BookmarkInfo,
  BookmarkSnapshot,
  BookmarkOrganizationResult,
  BookmarkDuplicateGroup,
  LocationSuggestion,
  FolderInfo,
} from "@/shared/types";
import {
  getSettings,
  saveSettings,
  setSessionData,
  getSessionData,
  clearSessionData,
  getLockedTabGroups,
  saveLockedTabGroups,
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
} from "@/core/bookmarks";
import { STORAGE_KEYS } from "@/shared/constants";
import { getAIProvider } from "@/ai/provider";

// Open side panel when extension icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Message handler
chrome.runtime.onMessage.addListener(
  (
    message: Message,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: String(err) });
    });
    return true;
  },
);

async function handleMessage(message: Message): Promise<MessageResponse> {
  switch (message.action) {
    case "get-settings":
      return { success: true, data: await getSettings() };

    case "save-settings":
      await saveSettings(message.payload as Partial<Settings>);
      return { success: true };

    case "organize-tabs":
      return await handleOrganizeTabs();

    case "apply-tab-suggestions":
      return await handleApplyTabSuggestions(
        message.payload as TabOrganizationResult,
      );

    case "undo-tab-changes":
      return await handleUndoTabChanges();

    case "organize-bookmarks":
      return await handleOrganizeBookmarks();

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

    default:
      return { success: false, error: `Unknown action: ${message.action}` };
  }
}

// ─── Tab Organization ───────────────────────────────────────────────

async function handleOrganizeTabs(): Promise<
  MessageResponse<TabOrganizationResult>
> {
  const settings = await getSettings();
  const allTabs = await queryAllTabs();

  const snapshot: TabSnapshot[] = allTabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  // Filter out tabs in locked groups
  const windowId = allTabs[0]?.windowId;
  const lockedGroups =
    windowId !== undefined ? await resolveLockedGroups(windowId) : [];
  const lockedTabIds = getLockedTabIds(lockedGroups, allTabs);
  const tabs = allTabs.filter((t) => !lockedTabIds.has(t.id));

  let result: TabOrganizationResult;

  if (settings.aiTier === "secure") {
    result = ruleBasedOrganize(tabs, settings.staleDaysThreshold);
  } else {
    try {
      const provider = await getAIProvider();
      const aiResult = await provider.organizeTabs(tabs);
      result = {
        tabs,
        groups: aiResult.groups,
        stale: aiResult.stale,
        duplicates: aiResult.duplicates,
        reasoning: aiResult.reasoning,
      };
    } catch (err) {
      console.warn("AI tab organization failed:", err);
      result = ruleBasedOrganize(tabs, settings.staleDaysThreshold);
      result.reasoning = `AI unavailable (${err instanceof Error ? err.message : String(err)}). ${result.reasoning}`;
    }
  }

  if (lockedGroups.length > 0) {
    result.reasoning = `${lockedGroups.length} locked group(s) excluded. ${result.reasoning ?? ""}`;
  }

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

  // Resolve locked groups and build protected tab ID set
  const lockedGroups = await resolveLockedGroups(windowId);
  const lockedTabIds = getLockedTabIds(lockedGroups, tabs);

  const snapshot: TabSnapshot[] = tabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  for (const group of result.groups) {
    const validTabIds = group.tabIds.filter(
      (id) => !lockedTabIds.has(id) && tabs.some((t) => t.id === id),
    );
    if (validTabIds.length === 0) continue;
    await createTabGroup({ ...group, tabIds: validTabIds }, windowId);
  }

  if (result.stale.length > 0) {
    const validStale = result.stale.filter(
      (id) => !lockedTabIds.has(id) && tabs.some((t) => t.id === id),
    );
    if (validStale.length > 0) await closeTabs(validStale);
  }

  for (const dupSet of result.duplicates) {
    if (dupSet.length > 1) {
      const validDups = dupSet
        .slice(1)
        .filter(
          (id) => !lockedTabIds.has(id) && tabs.some((t) => t.id === id),
        );
      if (validDups.length > 0) await closeTabs(validDups);
    }
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

  if (windowId !== undefined) {
    for (const tabIds of groupMap.values()) {
      const validIds = tabIds.filter((id) =>
        currentTabs.some((t) => t.id === id),
      );
      if (validIds.length > 0) {
        await chrome.tabs.group({
          tabIds: validIds as [number, ...number[]],
          createProperties: { windowId },
        });
      }
    }
  }

  await clearSessionData(STORAGE_KEYS.TAB_SNAPSHOT);
  return { success: true };
}

function ruleBasedOrganize(
  tabs: TabInfo[],
  staleDays: number,
): TabOrganizationResult {
  const domainMap = groupByDomain(tabs);
  const groups = domainToTabGroups(domainMap);
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

async function handleOrganizeBookmarks(): Promise<
  MessageResponse<BookmarkOrganizeResponse>
> {
  const settings = await getSettings();
  const tree = await getBookmarkTree();
  const bookmarks = flattenBookmarks(tree);
  const folders = extractFolders(tree);

  // Snapshot for undo
  await setSessionData(
    STORAGE_KEYS.BOOKMARK_SNAPSHOT,
    snapshotBookmarks(bookmarks),
  );

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

  try {
    const provider = await getAIProvider();
    const aiResult = await provider.organizeBookmarks(bookmarks);
    return {
      success: true,
      data: { bookmarks, folders, result: aiResult },
    };
  } catch (err) {
    console.warn("AI bookmark organization failed:", err);
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
  const bookmarks = flattenBookmarks(tree);
  const folderPathMap = buildFolderPathMap(tree);
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

async function handleApplyBookmarkSuggestions(
  payload: BookmarkApplyPayload,
): Promise<MessageResponse> {
  // Re-snapshot before applying
  const tree = await getBookmarkTree();
  const bookmarks = flattenBookmarks(tree);
  await setSessionData(
    STORAGE_KEYS.BOOKMARK_SNAPSHOT,
    snapshotBookmarks(bookmarks),
  );

  // Create new folders first and build a map of placeholder → real ID
  const folderIdMap = new Map<string, string>();
  for (const folder of payload.newFolders) {
    const created = await createFolder(folder.name, folder.parentId);
    folderIdMap.set(`${folder.name}:${folder.parentId}`, created.id);
  }

  // Apply moves
  for (const move of payload.moves) {
    const resolvedFolderId =
      folderIdMap.get(move.targetFolderId) ?? move.targetFolderId;
    try {
      await moveBookmark(move.bookmarkId, { parentId: resolvedFolderId });
    } catch (err) {
      console.warn(`Failed to move bookmark ${move.bookmarkId}:`, err);
    }
  }

  // Remove duplicates
  for (const id of payload.removals) {
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
