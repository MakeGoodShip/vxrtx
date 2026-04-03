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

/** Default timeout for LLM API calls (60 seconds). */
export const AI_FETCH_TIMEOUT_MS = 60_000;

/** Fetch wrapper with AbortController timeout. Throws on timeout instead of hanging forever. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = AI_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error(`AI request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
