import type {
  TabInfo,
  TabGroupColor,
  TabGroupSuggestion,
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
      groupId: tab.groupId ?? chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1,
      windowId: tab.windowId,
    }));
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
  await chrome.tabGroups.update(groupId, {
    title: suggestion.name,
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
