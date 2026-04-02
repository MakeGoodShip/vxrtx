import type { AIProvider, TabOrganizationAIResult } from "../types";
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

const SYSTEM_MESSAGE = "You are a browser tab and bookmark organizer. Always respond with ONLY valid JSON — no prose, no markdown, no code fences.";

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

  async organizeTabs(tabs: TabInfo[], granularity?: GroupingGranularity): Promise<TabOrganizationAIResult> {
    const input = this.includeUrls
      ? tabsToYoloInput(tabs)
      : tabsToRelaxedInput(tabs);
    const prompt = buildTabGroupingPrompt(input, {
      includeUrls: this.includeUrls,
      granularity,
    });
    return withRetry(
      (errorContext) => this.complete(prompt, errorContext),
      parseTabOrganization,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    granularity?: GroupingGranularity,
  ): Promise<BookmarkOrganizationResult> {
    const input = this.includeUrls
      ? bookmarksToYoloInput(bookmarks)
      : bookmarksToRelaxedInput(bookmarks);
    const prompt = buildBookmarkOrganizePrompt(input, {
      includeUrls: this.includeUrls,
      granularity,
    });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, errorContext),
      parseBookmarkOrganization,
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
  ): Promise<LocationSuggestion[]> {
    const input = this.includeUrls
      ? { id: bookmark.id, title: bookmark.title, url: bookmark.url }
      : { id: bookmark.id, title: bookmark.title };
    const prompt = buildBookmarkLocationPrompt(input, folders, {
      includeUrls: this.includeUrls,
    });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, errorContext),
      parseBookmarkLocation,
    );
    return parsed.suggestions;
  }

  private async complete(prompt: string, errorContext?: string): Promise<string> {
    if (!this.apiKey) throw new Error("OpenRouter API key not configured");

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;

    const response = await fetch(
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
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenRouter API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in OpenRouter response");
    return content;
  }
}
