import type {
  BookmarkDuplicateGroup,
  BookmarkFolderSuggestion,
  BookmarkInfo,
  BookmarkOrganizationResult,
  BookmarkSnapshot,
  FolderInfo,
  GroupingGranularity,
  LockedBookmarkFolder,
} from "@/shared/types";

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

export function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkInfo[] {
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
  function walk(node: chrome.bookmarks.BookmarkTreeNode, currentPath: string) {
    if (!node.url && node.children) {
      const path = currentPath ? `${currentPath}/${node.title}` : node.title || "Root";
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
  function walk(node: chrome.bookmarks.BookmarkTreeNode, path: string) {
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

export function findDuplicateBookmarks(bookmarks: BookmarkInfo[]): string[][] {
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

// Chrome's built-in root folder IDs that must never be removed
const PROTECTED_FOLDER_IDS = new Set(["0", "1", "2", "3"]);

export async function findEmptyFolders(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): Promise<{ id: string; title: string; path: string }[]> {
  const empties: { id: string; title: string; path: string }[] = [];

  function walk(node: chrome.bookmarks.BookmarkTreeNode, path: string) {
    if (node.url) return; // It's a bookmark, not a folder
    if (!node.children) return;

    const currentPath = path ? `${path}/${node.title}` : node.title || "Root";

    // A folder is empty if it has no children at all
    // or all its children are also empty folders (recursively)
    const hasContent = node.children.some(
      (child) => child.url || (child.children && child.children.length > 0),
    );

    if (!hasContent && node.children.length === 0 && !PROTECTED_FOLDER_IDS.has(node.id)) {
      empties.push({ id: node.id, title: node.title, path: currentPath });
    }

    for (const child of node.children) {
      walk(child, node.id === "0" ? "" : currentPath);
    }
  }

  for (const node of nodes) walk(node, "");
  return empties;
}

export async function removeEmptyFolders(): Promise<number> {
  let totalRemoved = 0;
  // Run multiple passes since removing a folder may make its parent empty
  for (let pass = 0; pass < 10; pass++) {
    const tree = await getBookmarkTree();
    const empties = await findEmptyFolders(tree);
    if (empties.length === 0) break;

    for (const folder of empties) {
      try {
        await chrome.bookmarks.removeTree(folder.id);
        totalRemoved++;
      } catch {
        // Folder may have been removed already by a parent removal
      }
    }
  }
  return totalRemoved;
}

// ─── Rule-Based Bookmark Organization ───────────────────────────────

/**
 * Group bookmarks by domain, similar to tab's groupByDomain.
 */
export function groupBookmarksByDomain(bookmarks: BookmarkInfo[]): Map<string, BookmarkInfo[]> {
  const domainMap = new Map<string, BookmarkInfo[]>();
  for (const bm of bookmarks) {
    if (!bm.url) continue;
    try {
      const hostname = new URL(bm.url).hostname.replace(/^www\./, "");
      // Use the main domain (e.g., "github" from "github.com")
      const existing = domainMap.get(hostname);
      if (existing) {
        existing.push(bm);
      } else {
        domainMap.set(hostname, [bm]);
      }
    } catch {
      // Skip bookmarks with invalid URLs
    }
  }
  return domainMap;
}

/**
 * Rule-based bookmark organization. Groups by domain with granularity-aware
 * minimum group size. No AI needed.
 */
export function ruleBasedBookmarkOrganize(
  bookmarks: BookmarkInfo[],
  granularity: GroupingGranularity = 3,
): BookmarkOrganizationResult {
  const domainMap = groupBookmarksByDomain(bookmarks);

  // Granularity affects minimum group size: 1→6, 2→4, 3→3, 4→2, 5→1
  const minGroupSize =
    granularity <= 1 ? 6 : granularity <= 2 ? 4 : granularity <= 3 ? 3 : granularity <= 4 ? 2 : 1;

  const folders: BookmarkFolderSuggestion[] = [];
  const ungrouped: BookmarkInfo[] = [];

  for (const [hostname, bms] of domainMap) {
    if (bms.length >= minGroupSize) {
      const name = hostname.split(".")[0];
      folders.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        bookmarkIds: bms.map((b) => b.id),
      });
    } else {
      ungrouped.push(...bms);
    }
  }

  // Group remaining ungrouped bookmarks into a "Misc" folder if there are enough
  if (ungrouped.length > 0) {
    folders.push({
      name: "Misc",
      bookmarkIds: ungrouped.map((b) => b.id),
    });
  }

  // Sort folders by bookmark count (largest first)
  folders.sort((a, b) => b.bookmarkIds.length - a.bookmarkIds.length);

  const duplicates = findDuplicateBookmarks(bookmarks);

  return {
    folders,
    moves: [],
    duplicates,
    newFolders: [],
    reasoning: `Grouped by domain (rule-based). ${folders.length} folders, ${duplicates.length} duplicate set(s) found.`,
  };
}

export function snapshotBookmarks(bookmarks: BookmarkInfo[]): BookmarkSnapshot[] {
  return bookmarks
    .filter((b) => b.parentId !== undefined && b.index !== undefined)
    .map((b) => ({
      id: b.id,
      parentId: b.parentId!,
      index: b.index!,
    }));
}

/**
 * Returns the set of bookmark IDs that live inside any locked folder
 * (including nested children of locked folders).
 */
export function getLockedBookmarkIds(
  lockedFolders: LockedBookmarkFolder[],
  bookmarks: BookmarkInfo[],
): Set<string> {
  const lockedFolderIds = new Set(lockedFolders.map((f) => f.folderId));
  return new Set(
    bookmarks
      .filter((b) => b.parentId !== undefined && lockedFolderIds.has(b.parentId!))
      .map((b) => b.id),
  );
}

/**
 * Returns bookmark IDs in locked folders, walking the full tree
 * to catch nested subfolders of locked parents.
 */
export function getDeepLockedBookmarkIds(
  lockedFolders: LockedBookmarkFolder[],
  tree: chrome.bookmarks.BookmarkTreeNode[],
): Set<string> {
  const lockedFolderIds = new Set(lockedFolders.map((f) => f.folderId));
  const lockedIds = new Set<string>();

  function walk(node: chrome.bookmarks.BookmarkTreeNode, parentLocked: boolean) {
    const isLocked = parentLocked || lockedFolderIds.has(node.id);
    if (isLocked && node.url) {
      lockedIds.add(node.id);
    }
    if (node.children) {
      for (const child of node.children) walk(child, isLocked);
    }
  }

  for (const node of tree) walk(node, false);
  return lockedIds;
}
