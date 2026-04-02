import type { AIProvider, TabOrganizationAIResult } from "../types";
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
  tabsToYoloInput,
} from "../prompts/tab-grouping";
import {
  buildBookmarkOrganizePrompt,
  buildBookmarkLocationPrompt,
  bookmarksToYoloInput,
} from "../prompts/bookmark-grouping";
import { parseTabOrganization, parseBookmarkOrganization, parseBookmarkLocation, withRetry } from "../parser";

const SYSTEM_MESSAGE = "You are a browser tab and bookmark organizer. Always respond with ONLY valid JSON — no prose, no markdown, no code fences.";

export class YoloProvider implements AIProvider {
  constructor(
    private modelProvider: AIModelProvider,
    private claudeKey: string,
    private openaiKey: string,
  ) {}

  async organizeTabs(tabs: TabInfo[], granularity?: GroupingGranularity): Promise<TabOrganizationAIResult> {
    const input = tabsToYoloInput(tabs);
    const prompt = buildTabGroupingPrompt(input, { includeUrls: true, granularity });
    return withRetry(
      (errorContext) => this.complete(prompt, errorContext),
      parseTabOrganization,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    granularity?: GroupingGranularity,
  ): Promise<BookmarkOrganizationResult> {
    const input = bookmarksToYoloInput(bookmarks);
    const prompt = buildBookmarkOrganizePrompt(input, { includeUrls: true, granularity });
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
    const input = { id: bookmark.id, title: bookmark.title, url: bookmark.url };
    const prompt = buildBookmarkLocationPrompt(input, folders, {
      includeUrls: true,
    });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, errorContext),
      parseBookmarkLocation,
    );
    return parsed.suggestions;
  }

  private async complete(prompt: string, errorContext?: string): Promise<string> {
    if (this.modelProvider === "claude") {
      return this.completeClaude(prompt, errorContext);
    }
    return this.completeOpenAI(prompt, errorContext);
  }

  private async completeClaude(prompt: string, errorContext?: string): Promise<string> {
    if (!this.claudeKey) throw new Error("Anthropic API key not configured");

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: [{ role: "user", content: userContent }],
      }),
    });

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

  private async completeOpenAI(prompt: string, errorContext?: string): Promise<string> {
    if (!this.openaiKey) throw new Error("OpenAI API key not configured");

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
    });

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
