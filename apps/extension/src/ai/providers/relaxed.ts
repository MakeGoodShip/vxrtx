import { SYSTEM_MESSAGE, fetchWithTimeout, aiTimeoutMs, type AIProvider, type TabOrganizationAIResult, type StatusCallback } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  AIModelProvider,
  GroupingGranularity,
} from "@/shared/types";
import {
  buildTabGroupingPrompt,
  buildTabGroupingPromptParts,
  tabsToRelaxedInput,
} from "../prompts/tab-grouping";
import {
  buildBookmarkOrganizePrompt,
  buildBookmarkOrganizePromptParts,
  buildBookmarkLocationPrompt,
  bookmarksToRelaxedInput,
} from "../prompts/bookmark-grouping";
import { parseTabOrganization, parseBookmarkOrganization, parseBookmarkLocation, withRetry } from "../parser";

/**
 * Relaxed provider: same API calls as YOLO but sends minimal data.
 * - Tab/bookmark titles only (no URLs)
 * - No favicons or other metadata
 */
export class RelaxedProvider implements AIProvider {
  constructor(
    private modelProvider: AIModelProvider,
    private claudeKey: string,
    private openaiKey: string,
  ) {}

  async organizeTabs(tabs: TabInfo[], granularity?: GroupingGranularity, onStatus?: StatusCallback): Promise<TabOrganizationAIResult> {
    const input = tabsToRelaxedInput(tabs);
    if (this.modelProvider === "claude") {
      const parts = buildTabGroupingPromptParts(input, { includeUrls: false, granularity });
      return withRetry(
        (errorContext) => this.completeClaude(parts.cached, parts.dynamic, tabs.length, errorContext),
        parseTabOrganization,
        onStatus,
      );
    }
    const prompt = buildTabGroupingPrompt(input, { includeUrls: false, granularity });
    return withRetry(
      (errorContext) => this.completeOpenAI(prompt, tabs.length, errorContext),
      parseTabOrganization,
      onStatus,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    granularity?: GroupingGranularity,
    onStatus?: StatusCallback,
  ): Promise<BookmarkOrganizationResult> {
    const input = bookmarksToRelaxedInput(bookmarks);
    let parsed;
    if (this.modelProvider === "claude") {
      const parts = buildBookmarkOrganizePromptParts(input, { includeUrls: false, granularity });
      parsed = await withRetry(
        (errorContext) => this.completeClaude(parts.cached, parts.dynamic, bookmarks.length, errorContext),
        parseBookmarkOrganization,
        onStatus,
      );
    } else {
      const prompt = buildBookmarkOrganizePrompt(input, { includeUrls: false, granularity });
      parsed = await withRetry(
        (errorContext) => this.completeOpenAI(prompt, bookmarks.length, errorContext),
        parseBookmarkOrganization,
        onStatus,
      );
    }
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
    const input = { id: bookmark.id, title: bookmark.title };
    const prompt = buildBookmarkLocationPrompt(input, folders, {
      includeUrls: false,
    });
    const parsed = await withRetry(
      (errorContext) => this.modelProvider === "claude"
        ? this.completeClaude(prompt, "", folders.length, errorContext)
        : this.completeOpenAI(prompt, folders.length, errorContext),
      parseBookmarkLocation,
      onStatus,
    );
    return parsed.suggestions;
  }

  private async completeClaude(
    cachedContent: string,
    dynamicContent: string,
    itemCount: number,
    errorContext?: string,
  ): Promise<string> {
    if (!this.claudeKey) throw new Error("Anthropic API key not configured");

    const userBlocks: { type: string; text: string; cache_control?: { type: string } }[] = [
      { type: "text", text: cachedContent, cache_control: { type: "ephemeral" } },
    ];
    const dynamicText = errorContext
      ? `${dynamicContent}\n\n${errorContext}`
      : dynamicContent;
    if (dynamicText) {
      userBlocks.push({ type: "text", text: dynamicText });
    }

    const timeout = aiTimeoutMs(itemCount);
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.claudeKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        temperature: 0.0,
        system: SYSTEM_MESSAGE,
        messages: [{ role: "user", content: userBlocks }],
      }),
    }, timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Claude API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text",
    );
    if (!textBlock?.text) throw new Error("No text in Claude response");
    return textBlock.text;
  }

  private async completeOpenAI(prompt: string, itemCount: number, errorContext?: string): Promise<string> {
    if (!this.openaiKey) throw new Error("OpenAI API key not configured");

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;
    const timeout = aiTimeoutMs(itemCount);

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_MESSAGE },
          { role: "user", content: userContent },
        ],
        temperature: 0.0,
        response_format: { type: "json_object" },
      }),
    }, timeout);

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in OpenAI response");
    return content;
  }
}
