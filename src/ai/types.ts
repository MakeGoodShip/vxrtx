import type {
  TabInfo,
  TabGroupSuggestion,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
} from "@/shared/types";

export type ProgressCallback = (
  current: number,
  total: number,
  message: string,
) => void;

export interface TabOrganizationAIResult {
  groups: TabGroupSuggestion[];
  stale: number[];
  duplicates: number[][];
  reasoning: string;
}

export interface AIProvider {
  organizeTabs(
    tabs: TabInfo[],
    onProgress?: ProgressCallback,
  ): Promise<TabOrganizationAIResult>;
  organizeBookmarks(
    bookmarks: BookmarkInfo[],
    onProgress?: ProgressCallback,
  ): Promise<BookmarkOrganizationResult>;
  suggestBookmarkLocation(
    bookmark: BookmarkInfo,
    folders: { id: string; path: string }[],
  ): Promise<LocationSuggestion[]>;
}

export interface AIRequestOptions {
  apiKey: string;
  model?: string;
}
