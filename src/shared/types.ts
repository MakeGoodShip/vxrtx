export type AITier = "secure" | "relaxed" | "yolo";

export type AIModelProvider = "claude" | "openai";

export interface Settings {
  aiTier: AITier;
  aiModelProvider: AIModelProvider;
  claudeApiKey: string;
  openaiApiKey: string;
  staleDaysThreshold: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aiTier: "secure",
  aiModelProvider: "claude",
  claudeApiKey: "",
  openaiApiKey: "",
  staleDaysThreshold: 7,
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
