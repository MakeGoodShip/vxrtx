import type { AIProvider, TabOrganizationAIResult } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
} from "@/shared/types";

/**
 * Local/Secure provider stub.
 * Phase 5 will add Chrome Built-in AI + Ollama support.
 * For now, returns an error directing users to choose a different tier.
 */
export class LocalProvider implements AIProvider {
  async organizeTabs(_tabs: TabInfo[], _granularity?: number): Promise<TabOrganizationAIResult> {
    throw new Error(
      "Local AI not yet available. Use rule-based grouping or switch to Relaxed/YOLO tier in Settings.",
    );
  }

  async organizeBookmarks(
    _bookmarks: BookmarkInfo[],
    _granularity?: number,
  ): Promise<BookmarkOrganizationResult> {
    throw new Error(
      "Local AI not yet available. Switch to Relaxed/YOLO tier in Settings.",
    );
  }

  async suggestBookmarkLocation(
    _bookmark: BookmarkInfo,
    _folders: { id: string; path: string }[],
  ): Promise<LocationSuggestion[]> {
    throw new Error(
      "Local AI not yet available. Switch to Relaxed/YOLO tier in Settings.",
    );
  }
}
