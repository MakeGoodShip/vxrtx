import type {
  TabInfo,
  TabGroupSuggestion,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
} from "@/shared/types";

export interface TabOrganizationAIResult {
  groups: TabGroupSuggestion[];
  stale: number[];
  duplicates: number[][];
  reasoning: string;
}

export interface AIProvider {
  organizeTabs(tabs: TabInfo[]): Promise<TabOrganizationAIResult>;
  organizeBookmarks(
    bookmarks: BookmarkInfo[],
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
