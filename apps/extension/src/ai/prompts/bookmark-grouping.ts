import type { BookmarkInfo, GroupingGranularity } from "@/shared/types";

interface BookmarkInput {
  id: string;
  title: string;
  url?: string;
}

// ─── Module: Rules ──────────────────────────────────────────────────

function rules(): string {
  return `RULES:
- Use short, descriptive folder names (1-3 words per segment)
- Use "/" to create folder hierarchy (e.g., "Dev/Frontend", "Personal/Finance")
- Top-level names are fine when nesting isn't needed (e.g., "Reference")
- Maximum nesting depth: 3 levels (e.g., "Work/Projects/Active")
- Each bookmark should belong to exactly one folder
- Identify duplicate bookmarks (same URL)
- Provide brief reasoning`;
}

// ─── Module: Granularity ────────────────────────────────────────────

function granularityInstruction(g: GroupingGranularity): string {
  const instructions: Record<GroupingGranularity, string> = {
    1: "Create very few, broad folders (2-4 max). Do NOT nest — use only flat top-level names like 'Work', 'Personal', 'Reference'.",
    2: "Create fewer folders with broader categories. Minimal nesting — prefer flat top-level folders, use sub-folders only when clearly needed. Aim for 3-6 folders.",
    3: "Create a balanced number of folders. Use 1-level nesting where natural groupings exist (e.g., 'Dev/Frontend', 'Dev/Backend'). Aim for a natural number of categories.",
    4: "Create more specific folders. Use nesting to separate sub-categories (e.g., 'Work/Tools', 'Work/Docs'). More specific sub-folders are better than one large folder.",
    5: "Create many fine-grained folders with rich hierarchy. Use 2-3 levels of nesting (e.g., 'Dev/Languages/TypeScript'). Each distinct topic, tool, or domain should get its own folder path.",
  };
  return `GROUPING DETAIL LEVEL: ${g}/5\n${instructions[g]}`;
}

// ─── Module: Few-Shot Examples ──────────────────────────────────────

function fewShotExamples(): string {
  return `EXAMPLES:

Example 1 — Dev tools + learning resources (with nesting):
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
    { "name": "Dev/Documentation", "bookmarkIds": ["a1", "a3", "a5"] },
    { "name": "Dev/Repos", "bookmarkIds": ["a2", "a6"] },
    { "name": "Dev/Tools", "bookmarkIds": ["a4"] }
  ],
  "duplicates": [],
  "reasoning": "Nested under Dev parent. Docs, repos, and tools separated as sub-folders."
}

Example 2 — Personal + finance + travel (with nesting):
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
    { "name": "Personal/Finance", "bookmarkIds": ["b1", "b4", "b6"] },
    { "name": "Personal/Travel", "bookmarkIds": ["b2", "b3"] },
    { "name": "Personal/Outdoors", "bookmarkIds": ["b5"] }
  ],
  "duplicates": [["b1", "b6"]],
  "reasoning": "All personal bookmarks nested under Personal parent. Finance, travel, and outdoors as sub-folders. Duplicate Mint detected."
}

Example 3 — Mixed work + media (flat + nested):
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
    { "name": "Work/Collaboration", "bookmarkIds": ["c1", "c3", "c4", "c6"] },
    { "name": "Media", "bookmarkIds": ["c2", "c5"] }
  ],
  "duplicates": [["c1", "c4"]],
  "reasoning": "Work tools nested under Work/Collaboration. Media stays flat — not enough items to justify sub-folders. Duplicate Notion detected."
}

Now organize the real bookmarks below using the same approach:`;
}

// ─── Module: Data Block ─────────────────────────────────────────────

function dataBlock(bookmarks: BookmarkInput[], options: { includeUrls: boolean }): string {
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
    { "name": "string (use '/' for hierarchy, e.g. 'Dev/Frontend')", "bookmarkIds": ["string"] }
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

export interface BookmarkPromptOptions {
  includeUrls: boolean;
  granularity?: GroupingGranularity;
  guidance?: string;
}

export function buildBookmarkOrganizePrompt(
  bookmarks: BookmarkInput[],
  options: BookmarkPromptOptions,
): string {
  const parts = buildBookmarkOrganizePromptParts(bookmarks, options);
  return `${parts.cached}\n\n${parts.dynamic}`;
}

export function buildBookmarkOrganizePromptParts(
  bookmarks: BookmarkInput[],
  options: BookmarkPromptOptions,
): PromptParts {
  const dynamicSections = [granularityInstruction(options.granularity ?? 3)];
  if (options.guidance?.trim()) {
    dynamicSections.push(
      `USER GUIDANCE:\n${options.guidance.trim()}\nFollow this guidance when organizing the bookmarks below.`,
    );
  }
  dynamicSections.push(dataBlock(bookmarks, options));

  return {
    cached: [rules(), fewShotExamples(), schemaBlock()].join("\n\n"),
    dynamic: dynamicSections.join("\n\n"),
  };
}

export function buildBookmarkLocationPrompt(
  bookmark: BookmarkInput,
  folders: { id: string; path: string }[],
  options: { includeUrls: boolean },
): string {
  const folderList = folders.map((f) => `  { id:"${f.id}", path:"${f.path}" }`).join("\n");

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

export function bookmarksToYoloInput(bookmarks: BookmarkInfo[]): BookmarkInput[] {
  return bookmarks.map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
  }));
}

export function bookmarksToRelaxedInput(bookmarks: BookmarkInfo[]): BookmarkInput[] {
  return bookmarks.map((b) => ({
    id: b.id,
    title: b.title,
  }));
}
