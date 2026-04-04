import type {
  TabInfo,
  TabGroupColor,
  TabGroupSuggestion,
  LockedTabGroup,
} from "@/shared/types";

export async function queryAllTabs(): Promise<TabInfo[]> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab) => tab.id !== undefined)
    .map((tab) => ({
      id: tab.id!,
      title: tab.title ?? "",
      url: tab.url ?? "",
      favIconUrl: tab.favIconUrl,
      lastAccessed: tab.lastAccessed,
      pinned: tab.pinned ?? false,
      groupId: tab.groupId ?? chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
      windowId: tab.windowId,
    }));
}

export async function queryTabGroups(
  windowId: number,
): Promise<chrome.tabGroups.TabGroup[]> {
  return chrome.tabGroups.query({ windowId });
}

export function getLockedTabIds(
  lockedGroups: LockedTabGroup[],
  tabs: TabInfo[],
): Set<number> {
  const lockedGroupIds = new Set(lockedGroups.map((g) => g.chromeGroupId));
  return new Set(
    tabs.filter((t) => lockedGroupIds.has(t.groupId)).map((t) => t.id),
  );
}

export function resolveStaleLockedGroups(
  lockedGroups: LockedTabGroup[],
  liveGroups: chrome.tabGroups.TabGroup[],
): { resolved: LockedTabGroup[]; changed: boolean } {
  const liveIds = new Set(liveGroups.map((g) => g.id));
  let changed = false;
  const resolved = lockedGroups.map((locked) => {
    if (liveIds.has(locked.chromeGroupId)) return locked;
    // Try to match by name + color
    const match = liveGroups.find(
      (g) => g.title === locked.name && g.color === locked.color,
    );
    if (match) {
      changed = true;
      return { ...locked, chromeGroupId: match.id };
    }
    return locked;
  });
  return { resolved, changed };
}

export async function createTabGroup(
  suggestion: TabGroupSuggestion,
  windowId: number,
): Promise<number> {
  const tabIds = suggestion.tabIds as [number, ...number[]];
  const groupId = await chrome.tabs.group({
    tabIds,
    createProperties: { windowId },
  });
  const title = suggestion.name?.trim() || "Untitled Group";
  await chrome.tabGroups.update(groupId, {
    title,
    color: suggestion.color as chrome.tabGroups.Color,
  });
  return groupId;
}

export async function ungroupTabs(tabIds: number[]): Promise<void> {
  if (tabIds.length === 0) return;
  await chrome.tabs.ungroup(tabIds as [number, ...number[]]);
}

export async function closeTabs(tabIds: number[]): Promise<void> {
  await chrome.tabs.remove(tabIds);
}

export function findDuplicatesByUrl(tabs: TabInfo[]): number[][] {
  const urlMap = new Map<string, number[]>();
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith("chrome://")) continue;
    const existing = urlMap.get(tab.url);
    if (existing) {
      existing.push(tab.id);
    } else {
      urlMap.set(tab.url, [tab.id]);
    }
  }
  return Array.from(urlMap.values()).filter((ids) => ids.length > 1);
}

export function findStaleTabs(
  tabs: TabInfo[],
  staleDays: number,
): number[] {
  const threshold = Date.now() - staleDays * 24 * 60 * 60 * 1000;
  return tabs
    .filter(
      (tab) =>
        tab.lastAccessed !== undefined && tab.lastAccessed < threshold,
    )
    .map((tab) => tab.id);
}

export function groupByDomain(
  tabs: TabInfo[],
): Map<string, TabInfo[]> {
  const domainMap = new Map<string, TabInfo[]>();
  for (const tab of tabs) {
    try {
      const domain = new URL(tab.url).hostname.replace("www.", "");
      const existing = domainMap.get(domain);
      if (existing) {
        existing.push(tab);
      } else {
        domainMap.set(domain, [tab]);
      }
    } catch {
      // Skip tabs with invalid URLs
    }
  }
  return domainMap;
}

const DOMAIN_COLOR_MAP: Record<string, TabGroupColor> = {
  "github.com": "purple",
  "stackoverflow.com": "orange",
  "google.com": "blue",
  "youtube.com": "red",
  "twitter.com": "cyan",
  "x.com": "cyan",
  "reddit.com": "orange",
  "linkedin.com": "blue",
};

const COLOR_CYCLE: TabGroupColor[] = [
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "cyan",
  "orange",
  "red",
];

export function domainToTabGroups(
  domainMap: Map<string, TabInfo[]>,
  minGroupSize: number = 2,
): TabGroupSuggestion[] {
  const groups: TabGroupSuggestion[] = [];
  let colorIndex = 0;

  for (const [domain, tabs] of domainMap) {
    if (tabs.length < minGroupSize) continue;

    const color =
      DOMAIN_COLOR_MAP[domain] ?? COLOR_CYCLE[colorIndex % COLOR_CYCLE.length];
    if (!DOMAIN_COLOR_MAP[domain]) colorIndex++;

    const name = domain.split(".")[0];
    groups.push({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      color,
      tabIds: tabs.map((t) => t.id),
    });
  }

  return groups;
}


// ─── Keyword-Enhanced Rule-Based Grouping ───────────────────────────

/** Common stop words to filter out of title keywords. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
  "has", "have", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "this", "that", "these", "those",
  "it", "its", "my", "your", "our", "their", "his", "her", "not", "no",
  "how", "what", "when", "where", "who", "which", "why", "all", "each",
  "new", "old", "get", "set", "use", "using", "home", "page", "about",
  "http", "https", "www", "com", "org", "net", "io",
]);

/** Extract meaningful keywords from a tab title. */
function extractKeywords(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * Theme-based grouping: find keyword clusters across tabs that share
 * common title keywords, regardless of domain. Runs AFTER domain grouping
 * to merge ungrouped/small-domain tabs into keyword-based themes.
 */
export function groupByKeywordThemes(
  tabs: TabInfo[],
  minGroupSize: number = 2,
): TabGroupSuggestion[] {
  // Build keyword → tab mapping
  const keywordTabs = new Map<string, Set<number>>();
  for (const tab of tabs) {
    const keywords = extractKeywords(tab.title);
    for (const kw of keywords) {
      const existing = keywordTabs.get(kw);
      if (existing) {
        existing.add(tab.id);
      } else {
        keywordTabs.set(kw, new Set([tab.id]));
      }
    }
  }

  // Find keywords that appear in enough tabs to form a group
  const candidates: { keyword: string; tabIds: number[] }[] = [];
  for (const [keyword, tabIdSet] of keywordTabs) {
    if (tabIdSet.size >= minGroupSize) {
      candidates.push({ keyword, tabIds: Array.from(tabIdSet) });
    }
  }

  // Sort by group size (largest first) and greedily assign tabs
  candidates.sort((a, b) => b.tabIds.length - a.tabIds.length);
  const assigned = new Set<number>();
  const groups: TabGroupSuggestion[] = [];
  let colorIndex = 0;

  for (const { keyword, tabIds } of candidates) {
    const unassigned = tabIds.filter((id) => !assigned.has(id));
    if (unassigned.length < minGroupSize) continue;

    for (const id of unassigned) assigned.add(id);

    groups.push({
      name: keyword.charAt(0).toUpperCase() + keyword.slice(1),
      color: COLOR_CYCLE[colorIndex % COLOR_CYCLE.length],
      tabIds: unassigned,
    });
    colorIndex++;
  }

  return groups;
}

/**
 * Enhanced rule-based organization: domain grouping first, then keyword
 * themes for ungrouped tabs. Combines both strategies for better results.
 */
export function enhancedRuleBasedGroups(
  tabs: TabInfo[],
  minGroupSize: number = 2,
): TabGroupSuggestion[] {
  // Step 1: Domain-based groups
  const domainMap = groupByDomain(tabs);
  const domainGroups = domainToTabGroups(domainMap, minGroupSize);

  // Collect tab IDs already assigned to domain groups
  const assignedIds = new Set<number>();
  for (const g of domainGroups) {
    for (const id of g.tabIds) assignedIds.add(id);
  }

  // Step 2: Keyword-based groups for unassigned tabs
  const unassignedTabs = tabs.filter((t) => !assignedIds.has(t.id));
  if (unassignedTabs.length < minGroupSize) return domainGroups;

  const keywordGroups = groupByKeywordThemes(unassignedTabs, minGroupSize);

  return [...domainGroups, ...keywordGroups];
}
