import type {
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  TabInfo,
} from "@/shared/types";
import {
  parseBookmarkLocation,
  parseBookmarkOrganization,
  parseTabOrganization,
  withRetry,
} from "../parser";
import {
  bookmarksToRelaxedInput,
  buildBookmarkLocationPrompt,
  buildBookmarkOrganizePrompt,
} from "../prompts/bookmark-grouping";
import { buildTabGroupingPrompt, tabsToRelaxedInput } from "../prompts/tab-grouping";
import {
  type AIProvider,
  aiMaxTokens,
  aiTimeoutMs,
  fetchWithTimeout,
  type OrganizeBookmarksOptions,
  type OrganizeTabsOptions,
  type StatusCallback,
  SYSTEM_MESSAGE,
  type TabOrganizationAIResult,
} from "../types";

/**
 * Ollama provider — connects to a local Ollama instance via its OpenAI-compatible API.
 * Runs entirely on the user's machine. No data leaves the device.
 * Requires Ollama to be installed and running (ollama.com).
 */
export class OllamaProvider implements AIProvider {
  constructor(
    private baseUrl: string,
    private model: string,
  ) {}

  async organizeTabs(
    tabs: TabInfo[],
    options?: OrganizeTabsOptions,
  ): Promise<TabOrganizationAIResult> {
    const { granularity, corrections, guidance, onStatus } = options ?? {};
    const input = tabsToRelaxedInput(tabs); // Secure tier: titles only, no URLs
    const prompt = buildTabGroupingPrompt(input, {
      includeUrls: false,
      granularity,
      corrections,
      guidance,
    });
    return withRetry(
      (errorContext) => this.complete(prompt, tabs.length, errorContext),
      parseTabOrganization,
      onStatus,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    options?: OrganizeBookmarksOptions,
  ): Promise<BookmarkOrganizationResult> {
    const { granularity, guidance, onStatus } = options ?? {};
    const input = bookmarksToRelaxedInput(bookmarks);
    const prompt = buildBookmarkOrganizePrompt(input, {
      includeUrls: false,
      granularity,
      guidance,
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
    const input = { id: bookmark.id, title: bookmark.title };
    const prompt = buildBookmarkLocationPrompt(input, folders, { includeUrls: false });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, folders.length, errorContext),
      parseBookmarkLocation,
      onStatus,
    );
    return parsed.suggestions;
  }

  private async complete(
    prompt: string,
    itemCount: number,
    errorContext?: string,
  ): Promise<string> {
    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;
    const timeout = aiTimeoutMs(itemCount);
    const maxTokens = aiMaxTokens(itemCount);
    const url = `${this.baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

    console.log(
      `[vxrtx] Ollama request: model=${this.model}, items=${itemCount}, prompt=${userContent.length} chars, timeout=${Math.round(timeout / 1000)}s`,
    );
    const startTime = Date.now();

    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_MESSAGE },
            { role: "user", content: userContent },
          ],
          temperature: 0.0,
          max_tokens: maxTokens,
          stream: false,
        }),
      },
      timeout,
    );

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[vxrtx] Ollama API error after ${elapsed}s: ${response.status}`, err);
      throw new Error(`Ollama error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error(
        `[vxrtx] Ollama empty response after ${elapsed}s:`,
        JSON.stringify(data).slice(0, 500),
      );
      throw new Error("No content in Ollama response");
    }

    console.log(`[vxrtx] Ollama response: ${elapsed}s, ${content.length} chars`);
    return content;
  }
}
