import type { BookmarkInfo, BookmarkOrganizationResult } from "@/shared/types";
import type { TabOrganizationAIResult } from "./types";
import type { TabInfo } from "@/shared/types";

export type ChunkProgressCallback = (
  current: number,
  total: number,
) => void;

/**
 * Splits an array into chunks of the given size.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Pause between chunks to let the GPU/CPU cool down.
 */
function cooldown(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Organizes tabs in chunks, then merges results.
 * Groups with the same name across chunks are combined.
 */
export async function organizeTabsChunked(
  tabs: TabInfo[],
  chunkSize: number,
  organizeChunk: (tabs: TabInfo[]) => Promise<TabOrganizationAIResult>,
  onProgress?: ChunkProgressCallback,
  cooldownMs: number = 0,
): Promise<TabOrganizationAIResult> {
  if (tabs.length <= chunkSize) {
    onProgress?.(1, 1);
    return organizeChunk(tabs);
  }

  const chunks = chunk(tabs, chunkSize);
  const results: TabOrganizationAIResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    results.push(await organizeChunk(chunks[i]));
    if (cooldownMs > 0 && i < chunks.length - 1) {
      await cooldown(cooldownMs);
    }
  }

  return mergeTabResults(results);
}

function mergeTabResults(
  results: TabOrganizationAIResult[],
): TabOrganizationAIResult {
  const groupMap = new Map<
    string,
    { name: string; color: string; tabIds: number[] }
  >();
  const allStale: number[] = [];
  const allDuplicates: number[][] = [];
  const reasons: string[] = [];

  for (const result of results) {
    for (const group of result.groups) {
      const key = group.name.toLowerCase();
      const existing = groupMap.get(key);
      if (existing) {
        existing.tabIds.push(...group.tabIds);
      } else {
        groupMap.set(key, { ...group, tabIds: [...group.tabIds] });
      }
    }
    allStale.push(...result.stale);
    allDuplicates.push(...result.duplicates);
    if (result.reasoning) reasons.push(result.reasoning);
  }

  return {
    groups: Array.from(groupMap.values()) as TabOrganizationAIResult["groups"],
    stale: allStale,
    duplicates: allDuplicates,
    reasoning: `Organized in ${results.length} batches. ${reasons[0] ?? ""}`,
  };
}

/**
 * Organizes bookmarks in chunks, then merges results.
 * Folders with the same name across chunks are combined.
 */
export async function organizeBookmarksChunked(
  bookmarks: BookmarkInfo[],
  chunkSize: number,
  organizeChunk: (
    bookmarks: BookmarkInfo[],
  ) => Promise<BookmarkOrganizationResult>,
  onProgress?: ChunkProgressCallback,
  cooldownMs: number = 0,
): Promise<BookmarkOrganizationResult> {
  if (bookmarks.length <= chunkSize) {
    onProgress?.(1, 1);
    return organizeChunk(bookmarks);
  }

  const chunks = chunk(bookmarks, chunkSize);
  const results: BookmarkOrganizationResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    onProgress?.(i + 1, chunks.length);
    results.push(await organizeChunk(chunks[i]));
    if (cooldownMs > 0 && i < chunks.length - 1) {
      await cooldown(cooldownMs);
    }
  }

  return mergeBookmarkResults(results);
}

function mergeBookmarkResults(
  results: BookmarkOrganizationResult[],
): BookmarkOrganizationResult {
  const folderMap = new Map<
    string,
    { name: string; bookmarkIds: string[]; parentId?: string }
  >();
  const allDuplicates: string[][] = [];
  const reasons: string[] = [];

  for (const result of results) {
    for (const folder of result.folders) {
      const key = folder.name.toLowerCase();
      const existing = folderMap.get(key);
      if (existing) {
        existing.bookmarkIds.push(...folder.bookmarkIds);
      } else {
        folderMap.set(key, {
          ...folder,
          bookmarkIds: [...folder.bookmarkIds],
        });
      }
    }
    allDuplicates.push(...result.duplicates);
    if (result.reasoning) reasons.push(result.reasoning);
  }

  return {
    folders: Array.from(folderMap.values()),
    moves: [],
    duplicates: allDuplicates,
    newFolders: [],
    reasoning: `Organized in ${results.length} batches. ${reasons[0] ?? ""}`,
  };
}
