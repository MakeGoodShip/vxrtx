import type { Message, MessageResponse } from "@/shared/messaging";
import type {
  Settings,
  TabInfo,
  TabOrganizationResult,
  TabSnapshot,
} from "@/shared/types";
import {
  getSettings,
  saveSettings,
  setSessionData,
  getSessionData,
  clearSessionData,
} from "@/core/storage";
import {
  queryAllTabs,
  createTabGroup,
  ungroupTabs,
  closeTabs,
  findDuplicatesByUrl,
  findStaleTabs,
  groupByDomain,
  domainToTabGroups,
} from "@/core/tabs";
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

    default:
      return { success: false, error: `Unknown action: ${message.action}` };
  }
}

async function handleOrganizeTabs(): Promise<
  MessageResponse<TabOrganizationResult>
> {
  const settings = await getSettings();
  const tabs = await queryAllTabs();

  // Snapshot current state for undo
  const snapshot: TabSnapshot[] = tabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  // Try AI-powered grouping, fall back to rule-based
  let result: TabOrganizationResult;

  if (settings.aiTier === "secure") {
    // Secure tier: use rule-based for now (Phase 5 adds local AI)
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
      // Fall back to rule-based on AI failure
      console.warn("AI tab organization failed, falling back to rule-based:", err);
      result = ruleBasedOrganize(tabs, settings.staleDaysThreshold);
      result.reasoning = `AI unavailable (${err instanceof Error ? err.message : String(err)}). ${result.reasoning}`;
    }
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

  // Re-snapshot right before applying so undo is accurate
  const snapshot: TabSnapshot[] = tabs.map((t) => ({
    id: t.id,
    groupId: t.groupId,
    windowId: t.windowId,
  }));
  await setSessionData(STORAGE_KEYS.TAB_SNAPSHOT, snapshot);

  // Apply groups
  for (const group of result.groups) {
    const validTabIds = group.tabIds.filter((id) =>
      tabs.some((t) => t.id === id),
    );
    if (validTabIds.length === 0) continue;
    await createTabGroup({ ...group, tabIds: validTabIds }, windowId);
  }

  // Close stale tabs
  if (result.stale.length > 0) {
    const validStale = result.stale.filter((id) =>
      tabs.some((t) => t.id === id),
    );
    if (validStale.length > 0) await closeTabs(validStale);
  }

  // Close duplicate tabs (keep first in each set)
  for (const dupSet of result.duplicates) {
    if (dupSet.length > 1) {
      const validDups = dupSet
        .slice(1)
        .filter((id) => tabs.some((t) => t.id === id));
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

  // Ungroup all currently grouped tabs first
  const groupedTabIds = currentTabs
    .filter((t) => t.groupId !== -1)
    .map((t) => t.id);
  if (groupedTabIds.length > 0) {
    await ungroupTabs(groupedTabIds);
  }

  // Re-group tabs that were grouped in the snapshot
  const groupMap = new Map<number, number[]>();
  for (const entry of snapshot) {
    if (entry.groupId !== -1) {
      const existing = groupMap.get(entry.groupId);
      if (existing) {
        existing.push(entry.id);
      } else {
        groupMap.set(entry.groupId, [entry.id]);
      }
    }
  }

  // Recreate groups (we can't restore exact group IDs, but we can regroup)
  const windowId = currentTabs[0]?.windowId;
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
