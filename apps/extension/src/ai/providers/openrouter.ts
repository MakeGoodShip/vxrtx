import { SYSTEM_MESSAGE, fetchWithTimeout, aiTimeoutMs, type AIProvider, type TabOrganizationAIResult, type StatusCallback, type OrganizeTabsOptions } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  GroupingGranularity,
} from "@/shared/types";
import {
  buildTabGroupingPrompt,
  tabsToYoloInput,
  tabsToRelaxedInput,
} from "../prompts/tab-grouping";
import {
  buildBookmarkOrganizePrompt,
  buildBookmarkLocationPrompt,
  bookmarksToYoloInput,
  bookmarksToRelaxedInput,
} from "../prompts/bookmark-grouping";
import {
  parseTabOrganization,
  parseBookmarkOrganization,
  parseBookmarkLocation,
  withRetry,
} from "../parser";

/**
 * OpenRouter provider — unified gateway to Claude, GPT, Llama, Mistral, etc.
 * Uses OpenAI-compatible chat completions API.
 * Users get one key at openrouter.ai that works with many models.
 */
export class OpenRouterProvider implements AIProvider {
  constructor(
    private apiKey: string,
    private model: string,
    private includeUrls: boolean,
  ) {}

  async organizeTabs(tabs: TabInfo[], options?: OrganizeTabsOptions): Promise<TabOrganizationAIResult> {
    const { granularity, corrections, onStatus } = options ?? {};
    const input = this.includeUrls
      ? tabsToYoloInput(tabs)
      : tabsToRelaxedInput(tabs);
    const prompt = buildTabGroupingPrompt(input, {
      includeUrls: this.includeUrls,
      granularity,
      corrections,
    });
    return withRetry(
      (errorContext) => this.complete(prompt, tabs.length, errorContext),
      parseTabOrganization,
      onStatus,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    granularity?: GroupingGranularity,
    onStatus?: StatusCallback,
  ): Promise<BookmarkOrganizationResult> {
    const input = this.includeUrls
      ? bookmarksToYoloInput(bookmarks)
      : bookmarksToRelaxedInput(bookmarks);
    const prompt = buildBookmarkOrganizePrompt(input, {
      includeUrls: this.includeUrls,
      granularity,
    });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, bookmarks.length, errorContext),
      parseBookmarkOrganization,
      onStatus,
    );
    return {
      folders: parsed.folders.map((f) => ({ ...f, parentId: undefined })),
      moves: [],
      duplicates: parsed.duplicates,
      newFolders: [],
      reasoning: parsed.reasoning,
    };
  }

  async suggestBookmarkLocation(
    bookmark: BookmarkInfo,
    folders: { id: string; path: string }[],
    onStatus?: StatusCallback,
  ): Promise<LocationSuggestion[]> {
    const input = this.includeUrls
      ? { id: bookmark.id, title: bookmark.title, url: bookmark.url }
      : { id: bookmark.id, title: bookmark.title };
    const prompt = buildBookmarkLocationPrompt(input, folders, {
      includeUrls: this.includeUrls,
    });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, folders.length, errorContext),
      parseBookmarkLocation,
      onStatus,
    );
    return parsed.suggestions;
  }

  private async complete(prompt: string, itemCount: number, errorContext?: string): Promise<string> {
    if (!this.apiKey) throw new Error("OpenRouter API key not configured");

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;
    const timeout = aiTimeoutMs(itemCount);
    const promptChars = userContent.length;

    console.log(`[vxrtx] OpenRouter request: model=${this.model}, items=${itemCount}, prompt=${promptChars} chars, timeout=${Math.round(timeout / 1000)}s`);
    const startTime = Date.now();

    let response: Response;
    try {
      response = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
            "HTTP-Referer": "https://github.com/vxrtx",
            "X-Title": "vxrtx",
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: SYSTEM_MESSAGE },
              { role: "user", content: userContent },
            ],
            temperature: 0.0,
          }),
        },
        timeout,
      );
    } catch (err) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[vxrtx] OpenRouter fetch failed after ${elapsed}s:`, err);
      throw err;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[vxrtx] OpenRouter API error after ${elapsed}s: ${response.status}`, err);
      throw new Error(`OpenRouter API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(`[vxrtx] OpenRouter empty response after ${elapsed}s:`, JSON.stringify(data).slice(0, 500));
      throw new Error("No content in OpenRouter response");
    }

    console.log(`[vxrtx] OpenRouter response: ${elapsed}s, ${content.length} chars`);
    return content;
  }
}
