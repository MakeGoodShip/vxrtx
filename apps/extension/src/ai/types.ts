import type {
  TabInfo,
  TabGroupSuggestion,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  GroupingGranularity,
  CorrectionSignal,
} from "@/shared/types";

export interface TabOrganizationAIResult {
  groups: TabGroupSuggestion[];
  stale: number[];
  duplicates: number[][];
  reasoning: string;
}

export type StatusCallback = (message: string) => void;

export interface OrganizeTabsOptions {
  granularity?: GroupingGranularity;
  corrections?: CorrectionSignal[];
  guidance?: string;
  onStatus?: StatusCallback;
}

export interface OrganizeBookmarksOptions {
  granularity?: GroupingGranularity;
  guidance?: string;
  onStatus?: StatusCallback;
}

export interface AIProvider {
  organizeTabs(
    tabs: TabInfo[],
    options?: OrganizeTabsOptions,
  ): Promise<TabOrganizationAIResult>;
  organizeBookmarks(
    bookmarks: BookmarkInfo[],
    options?: OrganizeBookmarksOptions,
  ): Promise<BookmarkOrganizationResult>;
  suggestBookmarkLocation(
    bookmark: BookmarkInfo,
    folders: { id: string; path: string }[],
    onStatus?: StatusCallback,
  ): Promise<LocationSuggestion[]>;
}

export interface AIRequestOptions {
  apiKey: string;
  model?: string;
}

export const SYSTEM_MESSAGE = "You are a browser tab and bookmark organizer. Always respond with ONLY valid JSON — no prose, no markdown, no code fences.";

/** Route Claude model by item count: Haiku for small sets, Sonnet for large. */
const CLAUDE_HAIKU = "claude-haiku-4-5-20251001";
const CLAUDE_SONNET = "claude-sonnet-4-20250514";
const CLAUDE_ROUTING_THRESHOLD = 30;

export function selectClaudeModel(itemCount: number): string {
  return itemCount <= CLAUDE_ROUTING_THRESHOLD ? CLAUDE_HAIKU : CLAUDE_SONNET;
}

/** Scale max_tokens by item count. Each item needs ~20 tokens in the output JSON. */
export function aiMaxTokens(itemCount: number): number {
  // Base 2048 for schema overhead + reasoning, plus ~20 tokens per item for ID assignments
  // Capped at 8192 for broad model compatibility (some models via OpenRouter cap lower)
  return Math.min(2048 + itemCount * 20, 8192);
}

/** Base timeout for LLM API calls. Scales with item count via aiTimeoutMs(). */
const AI_FETCH_BASE_TIMEOUT_MS = 30_000;
const AI_FETCH_PER_ITEM_MS = 250;
const AI_FETCH_MAX_TIMEOUT_MS = 90_000;

/** Calculate timeout based on item count. 30s base + 0.25s per item, capped at 90s. */
export function aiTimeoutMs(itemCount: number): number {
  return Math.min(AI_FETCH_BASE_TIMEOUT_MS + itemCount * AI_FETCH_PER_ITEM_MS, AI_FETCH_MAX_TIMEOUT_MS);
}

/** Fetch wrapper with AbortController timeout. Throws on timeout instead of hanging forever. */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
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
