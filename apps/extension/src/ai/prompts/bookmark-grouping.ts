import type { BookmarkInfo, GroupingGranularity } from "@/shared/types";

interface BookmarkInput {
  id: string;
  title: string;
  url?: string;
}

// ─── Module: Rules ──────────────────────────────────────────────────

function rules(): string {
  return `RULES:
- Use short, descriptive folder names (1-3 words)
- Each bookmark should belong to exactly one folder
- Identify duplicate bookmarks (same URL)
- Provide brief reasoning`;
}

// ─── Module: Granularity ────────────────────────────────────────────

function granularityInstruction(g: GroupingGranularity): string {
  const instructions: Record<GroupingGranularity, string> = {
    1: "Create very few, broad folders (2-4 max). Merge related topics aggressively. Prefer general categories like 'Work', 'Personal', 'Reference'.",
    2: "Create fewer folders with broader categories. Combine loosely related bookmarks. Aim for 3-6 folders.",
    3: "Create a balanced number of folders. Group by topic or purpose. Aim for a natural number of categories.",
    4: "Create more specific folders. Split topics into distinct sub-categories. More folders is better than fewer.",
    5: "Create many fine-grained folders. Each distinct topic, tool, or domain should get its own folder. Prefer specificity.",
  };
  return `GROUPING DETAIL LEVEL: ${g}/5\n${instructions[g]}`;
}

// ─── Module: Few-Shot Examples ──────────────────────────────────────

function fewShotExamples(): string {
  return `EXAMPLES:

Example 1 — Dev tools + learning resources:
Input:
  { id:"a1", title:"TypeScript Handbook" }
  { id:"a2", title:"GitHub - vxrtx" }
  { id:"a3", title:"MDN: Array.prototype.map()" }
  { id:"a4", title:"VS Code Keyboard Shortcuts" }
  { id:"a5", title:"Tailwind CSS Documentation" }
  { id:"a6", title:"GitHub - react" }
Output:
{
  "folders": [
    { "name": "Documentation", "bookmarkIds": ["a1", "a3", "a5"] },
    { "name": "GitHub Repos", "bookmarkIds": ["a2", "a6"] },
    { "name": "Dev Tools", "bookmarkIds": ["a4"] }
  ],
  "duplicates": [],
  "reasoning": "Language and framework docs grouped together, GitHub repos together, editor tools separate."
}

Example 2 — Personal + finance + travel:
Input:
  { id:"b1", title:"Mint - Budget Dashboard" }
  { id:"b2", title:"Airbnb: Tokyo Apartments" }
  { id:"b3", title:"Google Flights" }
  { id:"b4", title:"Vanguard - 401k" }
  { id:"b5", title:"AllTrails: Best Hikes Near Me" }
  { id:"b6", title:"Mint - Budget Dashboard" }
Output:
{
  "folders": [
    { "name": "Finance", "bookmarkIds": ["b1", "b4", "b6"] },
    { "name": "Travel", "bookmarkIds": ["b2", "b3"] },
    { "name": "Outdoors", "bookmarkIds": ["b5"] }
  ],
  "duplicates": [["b1", "b6"]],
  "reasoning": "Finance tools grouped, travel planning grouped, detected duplicate Mint bookmark. Hiking kept as separate interest."
}

Example 3 — Mixed work + media with duplicates:
Input:
  { id:"c1", title:"Notion - Team Wiki" }
  { id:"c2", title:"Spotify Web Player" }
  { id:"c3", title:"Slack - Engineering" }
  { id:"c4", title:"Notion - Team Wiki" }
  { id:"c5", title:"YouTube - Conference Talk: System Design" }
  { id:"c6", title:"Linear - Roadmap" }
Output:
{
  "folders": [
    { "name": "Work Tools", "bookmarkIds": ["c1", "c3", "c4", "c6"] },
    { "name": "Media", "bookmarkIds": ["c2", "c5"] }
  ],
  "duplicates": [["c1", "c4"]],
  "reasoning": "Work collaboration tools grouped together, media and entertainment grouped. Detected duplicate Notion bookmark."
}

Now organize the real bookmarks below using the same approach:`;
}

// ─── Module: Data Block ─────────────────────────────────────────────

function dataBlock(
  bookmarks: BookmarkInput[],
  options: { includeUrls: boolean },
): string {
  const lines = bookmarks.map((b) => {
    const parts = [`id:"${b.id}"`, `title:"${b.title}"`];
    if (options.includeUrls && b.url) parts.push(`url:"${b.url}"`);
    return `  { ${parts.join(", ")} }`;
  });
  return `BOOKMARKS:\n${lines.join("\n")}`;
}

// ─── Module: Schema Block ───────────────────────────────────────────

function schemaBlock(): string {
  return `Respond with ONLY valid JSON matching this schema:
{
  "folders": [
    { "name": "string", "bookmarkIds": ["string"] }
  ],
  "duplicates": [["string", "string"]],
  "reasoning": "string"
}`;
}

// ─── Builders ───────────────────────────────────────────────────────

export interface PromptParts {
  cached: string;
  dynamic: string;
}

export function buildBookmarkOrganizePrompt(
  bookmarks: BookmarkInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
): string {
  const parts = buildBookmarkOrganizePromptParts(bookmarks, options);
  return `${parts.cached}\n\n${parts.dynamic}`;
}

export function buildBookmarkOrganizePromptParts(
  bookmarks: BookmarkInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
): PromptParts {
  return {
    cached: [rules(), fewShotExamples(), schemaBlock()].join("\n\n"),
    dynamic: [granularityInstruction(options.granularity ?? 3), dataBlock(bookmarks, options)].join("\n\n"),
  };
}

export function buildBookmarkLocationPrompt(
  bookmark: BookmarkInput,
  folders: { id: string; path: string }[],
  options: { includeUrls: boolean },
): string {
  const folderList = folders
    .map((f) => `  { id:"${f.id}", path:"${f.path}" }`)
    .join("\n");

  const bookmarkDesc =
    options.includeUrls && bookmark.url
      ? `title:"${bookmark.title}", url:"${bookmark.url}"`
      : `title:"${bookmark.title}"`;

  return `Suggest the best folder for this bookmark.

BOOKMARK: { ${bookmarkDesc} }

EXISTING FOLDERS:
${folderList}

Respond with ONLY valid JSON matching this schema:
{
  "suggestions": [
    { "folderId": "string", "folderPath": "string", "confidence": number, "reason": "string" }
  ]
}

Return up to 3 suggestions, ranked by confidence (0-1).`;
}

// ─── Input Mappers ──────────────────────────────────────────────────

export function bookmarksToYoloInput(
  bookmarks: BookmarkInfo[],
): BookmarkInput[] {
  return bookmarks.map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
  }));
}

export function bookmarksToRelaxedInput(
  bookmarks: BookmarkInfo[],
): BookmarkInput[] {
  return bookmarks.map((b) => ({
    id: b.id,
    title: b.title,
  }));
}
