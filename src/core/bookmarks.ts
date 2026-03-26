import type { BookmarkInfo } from "@/shared/types";

export async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return chrome.bookmarks.getTree();
}

export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number },
): Promise<void> {
  await chrome.bookmarks.move(id, destination);
}

export async function createFolder(
  title: string,
  parentId: string,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return chrome.bookmarks.create({ title, parentId });
}

export async function removeBookmark(id: string): Promise<void> {
  await chrome.bookmarks.remove(id);
}

export function flattenBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): BookmarkInfo[] {
  const result: BookmarkInfo[] = [];
  function walk(node: chrome.bookmarks.BookmarkTreeNode) {
    if (node.url) {
      result.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
        index: node.index,
        dateAdded: node.dateAdded,
      });
    }
    if (node.children) {
      for (const child of node.children) walk(child);
    }
  }
  for (const node of nodes) walk(node);
  return result;
}

export function findDuplicateBookmarks(
  bookmarks: BookmarkInfo[],
): string[][] {
  const urlMap = new Map<string, string[]>();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    const existing = urlMap.get(bm.url);
    if (existing) {
      existing.push(bm.id);
    } else {
      urlMap.set(bm.url, [bm.id]);
    }
  }
  return Array.from(urlMap.values()).filter((ids) => ids.length > 1);
}
