import type { BookmarkInfo, GroupingGranularity } from "@/shared/types";

interface BookmarkInput {
  id: string;
  title: string;
  url?: string;
}

function granularityInstruction(g: GroupingGranularity): string {
  switch (g) {
    case 1:
      return "Create very few, broad folders (2-4 max). Merge related topics aggressively. Prefer general categories like 'Work', 'Personal', 'Reference'.";
    case 2:
      return "Create fewer folders with broader categories. Combine loosely related bookmarks. Aim for 3-6 folders.";
    case 3:
      return "Create a balanced number of folders. Group by topic or purpose. Aim for a natural number of categories.";
    case 4:
      return "Create more specific folders. Split topics into distinct sub-categories. More folders is better than fewer.";
    case 5:
      return "Create many fine-grained folders. Each distinct topic, tool, or domain should get its own folder. Prefer specificity.";
  }
}

export function buildBookmarkOrganizePrompt(
  bookmarks: BookmarkInput[],
  options: { includeUrls: boolean; granularity?: GroupingGranularity },
): string {
  const bookmarkList = bookmarks
    .map((b) => {
      const parts = [`id:"${b.id}"`, `title:"${b.title}"`];
      if (options.includeUrls && b.url) parts.push(`url:"${b.url}"`);
      return `  { ${parts.join(", ")} }`;
    })
    .join("\n");

  const granularity = options.granularity ?? 3;

  return `You are a bookmark organizer. Analyze these bookmarks and suggest a folder structure.

BOOKMARKS:
${bookmarkList}

GROUPING DETAIL LEVEL: ${granularity}/5
${granularityInstruction(granularity)}

RULES:
- Use short, descriptive folder names (1-3 words)
- Each bookmark should belong to exactly one folder
- Identify duplicate bookmarks (same URL)
- Provide brief reasoning

Respond with ONLY valid JSON matching this schema:
{
  "folders": [
    { "name": "string", "bookmarkIds": ["string"] }
  ],
  "duplicates": [["string", "string"]],
  "reasoning": "string"
}`;
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
