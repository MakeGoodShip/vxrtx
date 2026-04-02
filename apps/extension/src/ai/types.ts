import type {
  TabInfo,
  TabGroupSuggestion,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  GroupingGranularity,
} from "@/shared/types";

export interface TabOrganizationAIResult {
  groups: TabGroupSuggestion[];
  stale: number[];
  duplicates: number[][];
  reasoning: string;
}

export interface AIProvider {
  organizeTabs(
    tabs: TabInfo[],
    granularity?: GroupingGranularity,
  ): Promise<TabOrganizationAIResult>;
  organizeBookmarks(
    bookmarks: BookmarkInfo[],
    granularity?: GroupingGranularity,
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

export const SYSTEM_MESSAGE = "You are a browser tab and bookmark organizer. Always respond with ONLY valid JSON — no prose, no markdown, no code fences.";
