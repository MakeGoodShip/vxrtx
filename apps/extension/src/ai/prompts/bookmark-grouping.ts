import type { BookmarkInfo } from "@/shared/types";

interface BookmarkInput {
  id: string;
  title: string;
  url?: string;
}

export function buildBookmarkOrganizePrompt(
  bookmarks: BookmarkInput[],
  options: { includeUrls: boolean },
): string {
  const bookmarkList = bookmarks
    .map((b) => {
      const parts = [`id:"${b.id}"`, `title:"${b.title}"`];
      if (options.includeUrls && b.url) parts.push(`url:"${b.url}"`);
      return `  { ${parts.join(", ")} }`;
    })
    .join("\n");

  return `You are a bookmark organizer. Analyze these bookmarks and suggest a folder structure.

BOOKMARKS:
${bookmarkList}

RULES:
- Create logical folder categories (e.g., "Dev Tools", "News", "Shopping")
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

  const bookmarkDesc = options.includeUrls && bookmark.url
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
