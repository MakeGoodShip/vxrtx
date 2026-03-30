import type { TabInfo, GroupingGranularity } from "@/shared/types";

interface TabInput {
  id: number;
  title: string;
  url?: string;
  lastAccessed?: number;
}

function granularityInstruction(g: GroupingGranularity): string {
  switch (g) {
    case 1:
      return "Create very few, broad groups (2-4 max). Merge related topics aggressively. Prefer general categories like 'Work', 'Personal', 'Reference'.";
    case 2:
      return "Create fewer groups with broader categories. It's OK to combine loosely related tabs. Aim for 3-6 groups.";
    case 3:
      return "Create a balanced number of groups. Group by topic or project. Aim for a natural number of categories.";
    case 4:
      return "Create more specific groups. Split topics into distinct sub-categories where it makes sense. More groups is better than fewer.";
    case 5:
      return "Create many fine-grained groups. Each distinct topic, project, or domain should get its own group. Prefer specificity over brevity.";
  }
}

export function buildTabGroupingPrompt(
  tabs: TabInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
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

  const granularity = options.granularity ?? 3;

  return `You are a browser tab organizer. Analyze these open tabs and suggest logical groupings.

TABS:
${tabList}

GROUPING DETAIL LEVEL: ${granularity}/5
${granularityInstruction(granularity)}

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
