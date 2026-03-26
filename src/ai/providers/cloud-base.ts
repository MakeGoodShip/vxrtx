import type { AIProvider, TabOrganizationAIResult, ProgressCallback } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
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
} from "../parser";
import {
  organizeTabsChunked,
  organizeBookmarksChunked,
} from "../chunked";

const REQUEST_TIMEOUT_MS = 90_000; // 90 seconds per API call
const CLOUD_CHUNK_SIZE = 60; // Cloud models handle more context but still chunk for progress

/**
 * Base class for cloud AI providers.
 * Handles chunking, timeouts, progress, and the organize/suggest interface.
 * Subclasses only need to implement `complete(prompt)`.
 */
export abstract class CloudProvider implements AIProvider {
  constructor(protected includeUrls: boolean) {}

  protected abstract complete(prompt: string): Promise<string>;

  private async completeWithTimeout(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      return await this.completeWithAbort(prompt, controller.signal);
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(
          "Request timed out after 90 seconds. The AI provider may be overloaded. Try again or switch to a different model.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Override this instead of `complete` if you need abort signal support.
   * Default implementation ignores the signal and calls `complete`.
   */
  protected async completeWithAbort(
    prompt: string,
    _signal: AbortSignal,
  ): Promise<string> {
    return this.complete(prompt);
  }

  async organizeTabs(
    tabs: TabInfo[],
    onProgress?: ProgressCallback,
  ): Promise<TabOrganizationAIResult> {
    return organizeTabsChunked(
      tabs,
      CLOUD_CHUNK_SIZE,
      async (chunk) => {
        const input = this.includeUrls
          ? tabsToYoloInput(chunk)
          : tabsToRelaxedInput(chunk);
        const prompt = buildTabGroupingPrompt(input, {
          includeUrls: this.includeUrls,
        });
        const response = await this.completeWithTimeout(prompt);
        return parseTabOrganization(response);
      },
      onProgress
        ? (current, total) =>
            onProgress(current, total, `Processing tabs (batch ${current}/${total})`)
        : undefined,
      200, // light cooldown between cloud calls
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    onProgress?: ProgressCallback,
  ): Promise<BookmarkOrganizationResult> {
    return organizeBookmarksChunked(
      bookmarks,
      CLOUD_CHUNK_SIZE,
      async (chunk) => {
        const input = this.includeUrls
          ? bookmarksToYoloInput(chunk)
          : bookmarksToRelaxedInput(chunk);
        const prompt = buildBookmarkOrganizePrompt(input, {
          includeUrls: this.includeUrls,
        });
        const response = await this.completeWithTimeout(prompt);
        const parsed = parseBookmarkOrganization(response);
        return {
          folders: parsed.folders.map((f) => ({ ...f, parentId: undefined })),
          moves: [],
          duplicates: parsed.duplicates,
          newFolders: [],
          reasoning: parsed.reasoning,
        };
      },
      onProgress
        ? (current, total) =>
            onProgress(
              current,
              total,
              `Processing bookmarks (batch ${current}/${total})`,
            )
        : undefined,
      200,
    );
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
    const response = await this.completeWithTimeout(prompt);
    return parseBookmarkLocation(response).suggestions;
  }
}
