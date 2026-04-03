import type { TabInfo, GroupingGranularity } from "@/shared/types";

interface TabInput {
  id: number;
  title: string;
  url?: string;
  lastAccessed?: number;
}

// ─── Module: Rules ──────────────────────────────────────────────────

function rules(): string {
  return `RULES:
- Group tabs by topic, project, or activity (not just domain)
- Use short, descriptive group names (1-3 words)
- Assign a color from: grey, blue, red, yellow, green, pink, purple, cyan, orange
- Try to use different colors for different groups
- A tab can only belong to one group
- Tabs that don't fit any group can be omitted
- Flag tabs as "stale" if last_accessed is more than 7 days ago and they seem unimportant
- Flag exact duplicate URLs (same URL appearing multiple times) — list sets of duplicate tab IDs
- Provide brief reasoning for your grouping choices`;
}

// ─── Module: Granularity ────────────────────────────────────────────

function granularityInstruction(g: GroupingGranularity): string {
  const instructions: Record<GroupingGranularity, string> = {
    1: "Create very few, broad groups (2-4 max). Merge related topics aggressively. Prefer general categories like 'Work', 'Personal', 'Reference'.",
    2: "Create fewer groups with broader categories. It's OK to combine loosely related tabs. Aim for 3-6 groups.",
    3: "Create a balanced number of groups. Group by topic or project. Aim for a natural number of categories.",
    4: "Create more specific groups. Split topics into distinct sub-categories where it makes sense. More groups is better than fewer.",
    5: "Create many fine-grained groups. Each distinct topic, project, or domain should get its own group. Prefer specificity over brevity.",
  };
  return `GROUPING DETAIL LEVEL: ${g}/5\n${instructions[g]}`;
}

// ─── Module: Few-Shot Examples ──────────────────────────────────────

function fewShotExamples(): string {
  return `EXAMPLES:

Example 1 — Dev + documentation mix:
Input:
  { id:1, title:"React useState Hook – React Docs" }
  { id:2, title:"GitHub - myapp: Pull request #42" }
  { id:3, title:"Stack Overflow: useEffect cleanup" }
  { id:4, title:"Jira Board - Sprint 12" }
  { id:5, title:"AWS S3 Console" }
  { id:6, title:"GitHub - myapp: Actions workflow runs" }
Output:
{
  "groups": [
    { "name": "React Research", "color": "blue", "tabIds": [1, 3] },
    { "name": "myapp Dev", "color": "purple", "tabIds": [2, 6] },
    { "name": "Project Mgmt", "color": "yellow", "tabIds": [4] },
    { "name": "Infrastructure", "color": "orange", "tabIds": [5] }
  ],
  "stale": [],
  "duplicates": [],
  "reasoning": "Grouped React docs together, myapp GitHub tabs together, separated project management and infra."
}

Example 2 — Shopping + social + media:
Input:
  { id:10, title:"Amazon.com: Wireless Headphones" }
  { id:11, title:"YouTube - Lo-fi Hip Hop Radio" }
  { id:12, title:"Reddit - r/headphones buying guide" }
  { id:13, title:"Amazon.com: USB-C Cable 3-Pack" }
  { id:14, title:"Twitter / X - Home" }
  { id:15, title:"Netflix - Continue Watching" }
Output:
{
  "groups": [
    { "name": "Shopping", "color": "green", "tabIds": [10, 13] },
    { "name": "Audio Research", "color": "blue", "tabIds": [12] },
    { "name": "Media", "color": "red", "tabIds": [11, 15] },
    { "name": "Social", "color": "cyan", "tabIds": [14] }
  ],
  "stale": [],
  "duplicates": [],
  "reasoning": "Amazon tabs grouped as Shopping, Reddit headphone guide kept separate as research, streaming and music grouped as Media."
}

Example 3 — Mixed with stale and duplicates:
Input:
  { id:20, title:"Google Docs - Q3 Planning", last_accessed:14d_ago }
  { id:21, title:"Figma - Dashboard Redesign" }
  { id:22, title:"Figma - Dashboard Redesign" }
  { id:23, title:"Linear - Issue ENG-301" }
  { id:24, title:"ChatGPT", last_accessed:21d_ago }
  { id:25, title:"MDN Web Docs: CSS Grid" }
Output:
{
  "groups": [
    { "name": "Design", "color": "pink", "tabIds": [21, 22] },
    { "name": "Engineering", "color": "purple", "tabIds": [23] },
    { "name": "Reference", "color": "grey", "tabIds": [25] }
  ],
  "stale": [20, 24],
  "duplicates": [[21, 22]],
  "reasoning": "Flagged Q3 Planning (14d) and ChatGPT (21d) as stale. Detected duplicate Figma tabs. Grouped remaining by function."
}

Now analyze the real tabs below using the same approach:`;
}

// ─── Module: Data Block ─────────────────────────────────────────────

function dataBlock(
  tabs: TabInput[],
  options: { includeUrls: boolean },
): string {
  const lines = tabs.map((t) => {
    const parts = [`id:${t.id}`, `title:"${t.title}"`];
    if (options.includeUrls && t.url) parts.push(`url:"${t.url}"`);
    if (t.lastAccessed) {
      const daysAgo = Math.floor(
        (Date.now() - t.lastAccessed) / (1000 * 60 * 60 * 24),
      );
      parts.push(`last_accessed:${daysAgo}d_ago`);
    }
    return `  { ${parts.join(", ")} }`;
  });
  return `TABS:\n${lines.join("\n")}`;
}

// ─── Module: Schema Block ───────────────────────────────────────────

function schemaBlock(): string {
  return `Respond with ONLY valid JSON matching this schema:
{
  "groups": [
    { "name": "string", "color": "string", "tabIds": [number] }
  ],
  "stale": [number],
  "duplicates": [[number, number]],
  "reasoning": "string"
}`;
}

// ─── Builder ────────────────────────────────────────────────────────

export interface PromptParts {
  /** Static portion (rules + few-shot + schema) — identical across calls, cacheable. */
  cached: string;
  /** Dynamic portion (granularity + data) — changes per request. */
  dynamic: string;
}

export function buildTabGroupingPrompt(
  tabs: TabInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
): string {
  const parts = buildTabGroupingPromptParts(tabs, options);
  return `${parts.cached}\n\n${parts.dynamic}`;
}

export function buildTabGroupingPromptParts(
  tabs: TabInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
): PromptParts {
  return {
    cached: [rules(), fewShotExamples(), schemaBlock()].join("\n\n"),
    dynamic: [granularityInstruction(options.granularity ?? 3), dataBlock(tabs, options)].join("\n\n"),
  };
}

// ─── Input Mappers ──────────────────────────────────────────────────

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
