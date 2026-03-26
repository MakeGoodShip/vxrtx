import type {
  BookmarkInfo,
  BookmarkSnapshot,
  FolderInfo,
  BookmarkDuplicateGroup,
} from "@/shared/types";

export async function getBookmarkTree(): Promise<
  chrome.bookmarks.BookmarkTreeNode[]
> {
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

export function extractFolders(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  parentPath: string = "",
): FolderInfo[] {
  const folders: FolderInfo[] = [];
  function walk(
    node: chrome.bookmarks.BookmarkTreeNode,
    currentPath: string,
  ) {
    if (!node.url && node.children) {
      const path = currentPath
        ? `${currentPath}/${node.title}`
        : node.title || "Root";
      if (node.id !== "0") {
        folders.push({
          id: node.id,
          title: node.title,
          path,
          parentId: node.parentId,
        });
      }
      for (const child of node.children) {
        walk(child, node.id === "0" ? "" : path);
      }
    }
  }
  for (const node of nodes) walk(node, parentPath);
  return folders;
}

export function buildFolderPathMap(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): Map<string, string> {
  const map = new Map<string, string>();
  function walk(
    node: chrome.bookmarks.BookmarkTreeNode,
    path: string,
  ) {
    const currentPath = path ? `${path}/${node.title}` : node.title || "";
    if (!node.url) {
      map.set(node.id, currentPath || "Root");
    }
    if (node.children) {
      for (const child of node.children) {
        walk(child, node.id === "0" ? "" : currentPath);
      }
    }
  }
  for (const node of nodes) walk(node, "");
  return map;
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

export function findDuplicateBookmarksDetailed(
  bookmarks: BookmarkInfo[],
): BookmarkDuplicateGroup[] {
  const urlMap = new Map<string, BookmarkInfo[]>();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    const existing = urlMap.get(bm.url);
    if (existing) {
      existing.push(bm);
    } else {
      urlMap.set(bm.url, [bm]);
    }
  }
  return Array.from(urlMap.entries())
    .filter(([, bms]) => bms.length > 1)
    .map(([url, bms]) => ({ url, bookmarks: bms }));
}

export function snapshotBookmarks(
  bookmarks: BookmarkInfo[],
): BookmarkSnapshot[] {
  return bookmarks
    .filter((b) => b.parentId !== undefined && b.index !== undefined)
    .map((b) => ({
      id: b.id,
      parentId: b.parentId!,
      index: b.index!,
    }));
}
