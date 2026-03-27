import type { TabInfo } from "@/shared/types";

interface TabInput {
  id: number;
  title: string;
  url?: string;
  lastAccessed?: number;
}

export function buildTabGroupingPrompt(
  tabs: TabInput[],
  options: { includeUrls: boolean },
): string {
  const tabList = tabs
    .map((t) => {
      const parts = [`id:${t.id}`, `title:"${t.title}"`];
      if (options.includeUrls && t.url) parts.push(`url:"${t.url}"`);
      if (t.lastAccessed) {
        const daysAgo = Math.floor(
          (Date.now() - t.lastAccessed) / (1000 * 60 * 60 * 24),
        );
        parts.push(`last_accessed:${daysAgo}d_ago`);
      }
      return `  { ${parts.join(", ")} }`;
    })
    .join("\n");

  return `You are a browser tab organizer. Analyze these open tabs and suggest logical groupings.

TABS:
${tabList}

RULES:
- Group tabs by topic, project, or activity (not just domain)
- Use short, descriptive group names (1-3 words)
- Assign a color from: grey, blue, red, yellow, green, pink, purple, cyan, orange
- Try to use different colors for different groups
- A tab can only belong to one group
- Tabs that don't fit any group can be omitted
- Flag tabs as "stale" if last_accessed is more than 7 days ago and they seem unimportant
- Flag exact duplicate URLs (same URL appearing multiple times) — list sets of duplicate tab IDs
- Provide brief reasoning for your grouping choices

Respond with ONLY valid JSON matching this schema:
{
  "groups": [
    { "name": "string", "color": "string", "tabIds": [number] }
  ],
  "stale": [number],
  "duplicates": [[number, number]],
  "reasoning": "string"
}`;
}

export function tabsToYoloInput(tabs: TabInfo[]): TabInput[] {
  return tabs.map((t) => ({
    id: t.id,
    title: t.title,
    url: t.url,
    lastAccessed: t.lastAccessed,
  }));
}

export function tabsToRelaxedInput(tabs: TabInfo[]): TabInput[] {
  return tabs.map((t) => ({
    id: t.id,
    title: t.title,
    lastAccessed: t.lastAccessed,
  }));
}
