export type AITier = "secure" | "relaxed" | "yolo";

export type AIModelProvider = "claude" | "openai" | "openrouter";

export interface Settings {
  aiTier: AITier;
  aiModelProvider: AIModelProvider;
  claudeApiKey: string;
  openaiApiKey: string;
  openrouterApiKey: string;
  openrouterModel: string;
  staleDaysThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aiTier: "secure",
  aiModelProvider: "openrouter",
  claudeApiKey: "",
  openaiApiKey: "",
  openrouterApiKey: "",
  openrouterModel: "anthropic/claude-sonnet-4",
  staleDaysThreshold: 7,
};

export type GroupingGranularity = 1 | 2 | 3 | 4 | 5;

export const GRANULARITY_LABELS: Record<GroupingGranularity, string> = {
  1: "Broad",
  2: "Relaxed",
  3: "Balanced",
  4: "Detailed",
  5: "Fine-grained",
};

export type TabGroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export interface TabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  lastAccessed?: number;
  pinned: boolean;
  groupId: number;
  windowId: number;
}

export interface TabGroupSuggestion {
  name: string;
  color: TabGroupColor;
  tabIds: number[];
}

export interface TabOrganizationResult {
  tabs: TabInfo[];
  groups: TabGroupSuggestion[];
  stale: number[];
  duplicates: number[][];
  reasoning?: string;
}

export interface TabSnapshot {
  id: number;
  groupId: number;
  windowId: number;
}

export interface LockedTabGroup {
  chromeGroupId: number;
  name: string;
  color: TabGroupColor;
  lockedAt: number;
}

export interface LockedBookmarkFolder {
  folderId: string;
  title: string;
  path: string;
  lockedAt: number;
}

export interface BookmarkInfo {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
}

export interface BookmarkFolderSuggestion {
  name: string;
  bookmarkIds: string[];
  parentId?: string;
}

export interface BookmarkOrganizationResult {
  folders: BookmarkFolderSuggestion[];
  moves: { bookmarkId: string; targetFolderId: string }[];
  duplicates: string[][];
  newFolders: { name: string; parentId: string }[];
  reasoning?: string;
}

export interface LocationSuggestion {
  folderId: string;
  folderPath: string;
  confidence: number;
  reason: string;
}

export interface BookmarkSnapshot {
  id: string;
  parentId: string;
  index: number;
}

export interface FolderInfo {
  id: string;
  title: string;
  path: string;
  parentId?: string;
}

export interface BookmarkDuplicateGroup {
  url: string;
  bookmarks: BookmarkInfo[];
}

// ─── Correction Signals ─────────────────────────────────────────────

export type SignalSource = "correction" | "acceptance";

export interface CorrectionSignal {
  /** Domain the correction applies to (e.g., "github.com") */
  domain: string;
  /** Group name the user prefers for this domain */
  preferredGroup?: string;
  /** Group name the user rejected for this domain */
  rejectedGroup?: string;
  /** Number of times this signal has been recorded */
  count: number;
  /** Timestamp of the most recent occurrence */
  lastSeen: number;
  /** Whether this came from an explicit edit or implicit acceptance. Defaults to "correction" for backward compat. */
  source?: SignalSource;
}

// ─── Snapshots ──────────────────────────────────────────────────────

export type SnapshotSource = "auto" | "manual";
export type SnapshotType = "tabs" | "bookmarks" | "both";

export interface Snapshot {
  id: string;
  timestamp: number;
  type: SnapshotType;
  label: string;
  source: SnapshotSource;
  tabCount: number;
  bookmarkCount: number;
  tabs: TabSnapshot[];
  bookmarks: BookmarkSnapshot[];
}
