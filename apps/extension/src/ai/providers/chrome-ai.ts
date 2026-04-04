import { SYSTEM_MESSAGE, type AIProvider, type TabOrganizationAIResult, type OrganizeTabsOptions, type OrganizeBookmarksOptions, type StatusCallback } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
} from "@/shared/types";
import {
  buildTabGroupingPrompt,
  tabsToRelaxedInput,
} from "../prompts/tab-grouping";
import {
  buildBookmarkOrganizePrompt,
  buildBookmarkLocationPrompt,
  bookmarksToRelaxedInput,
} from "../prompts/bookmark-grouping";
import { parseTabOrganization, parseBookmarkOrganization, parseBookmarkLocation, withRetry } from "../parser";

// Chrome's LanguageModel API types (not in TS lib yet)
declare const LanguageModel: {
  availability(): Promise<"available" | "downloadable" | "downloading" | "unavailable">;
  create(options?: { systemPrompt?: string; temperature?: number; topK?: number }): Promise<ChromeAISession>;
} | undefined;

interface ChromeAISession {
  prompt(text: string): Promise<string>;
  destroy(): void;
}

/**
 * Check if Chrome's built-in AI (Prompt API) is available.
 */
export async function isChromeAIAvailable(): Promise<boolean> {
  try {
    if (typeof LanguageModel === "undefined") return false;
    const status = await LanguageModel.availability();
    return status === "available" || status === "downloadable";
  } catch {
    return false;
  }
}

/**
 * Chrome Built-in AI provider — uses Gemini Nano on-device via Chrome's Prompt API.
 * Available in Chrome 138+ extensions. No network, fully private.
 * Model quality is lower than cloud APIs but works offline.
 */
export class ChromeAIProvider implements AIProvider {
  async organizeTabs(tabs: TabInfo[], options?: OrganizeTabsOptions): Promise<TabOrganizationAIResult> {
    const { granularity, corrections, guidance, onStatus } = options ?? {};
    const input = tabsToRelaxedInput(tabs);
    const prompt = buildTabGroupingPrompt(input, { includeUrls: false, granularity, corrections, guidance });
    return withRetry(
      (errorContext) => this.complete(prompt, errorContext),
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
    const prompt = buildBookmarkOrganizePrompt(input, { includeUrls: false, granularity, guidance });
    const parsed = await withRetry(
      (errorContext) => this.complete(prompt, errorContext),
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
      (errorContext) => this.complete(prompt, errorContext),
      parseBookmarkLocation,
      onStatus,
    );
    return parsed.suggestions;
  }

  private async complete(prompt: string, errorContext?: string): Promise<string> {
    if (typeof LanguageModel === "undefined") {
      throw new Error("Chrome Built-in AI is not available. Enable it in chrome://flags or use Ollama instead.");
    }

    const status = await LanguageModel.availability();
    if (status === "unavailable") {
      throw new Error("Chrome AI model is unavailable on this device. Try Ollama instead.");
    }
    if (status === "downloadable" || status === "downloading") {
      console.log(`[vxrtx] Chrome AI model status: ${status}, triggering download...`);
    }

    const userContent = errorContext ? `${prompt}\n\n${errorContext}` : prompt;

    console.log(`[vxrtx] Chrome AI request: prompt=${userContent.length} chars`);
    const startTime = Date.now();

    let session: ChromeAISession | undefined;
    try {
      session = await LanguageModel.create({
        systemPrompt: SYSTEM_MESSAGE,
        temperature: 0.0,
      });

      const result = await session.prompt(userContent);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[vxrtx] Chrome AI response: ${elapsed}s, ${result.length} chars`);
      return result;
    } finally {
      session?.destroy();
    }
  }
}
