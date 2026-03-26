/// <reference path="../../chrome-ai.d.ts" />

import type { AIProvider, TabOrganizationAIResult, ProgressCallback } from "../types";
import type {
  TabInfo,
  BookmarkInfo,
  BookmarkOrganizationResult,
  LocationSuggestion,
  LocalAIBackend,
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
import {
  parseTabOrganization,
  parseBookmarkOrganization,
  parseBookmarkLocation,
} from "../parser";
import {
  organizeTabsChunked,
  organizeBookmarksChunked,
} from "../chunked";

export interface LocalAIStatus {
  chromeAI: "available" | "downloadable" | "downloading" | "unavailable";
  ollama: "available" | "unavailable";
  ollamaModels: string[];
}

export class LocalProvider implements AIProvider {
  constructor(
    private backend: LocalAIBackend = "chrome-ai",
    private ollamaModel: string = "llama3.2",
  ) {}

  // Chrome AI has a very small context (~4K tokens) → 20 items per chunk
  // Ollama varies but most small models handle ~80 comfortably
  private get chunkSize() {
    return this.backend === "chrome-ai" ? 20 : 80;
  }

  // Cooldown between chunks in ms — gives the GPU time to breathe
  private get cooldownMs() {
    return this.backend === "chrome-ai" ? 2000 : 500;
  }

  async organizeTabs(
    tabs: TabInfo[],
    onProgress?: ProgressCallback,
  ): Promise<TabOrganizationAIResult> {
    return organizeTabsChunked(
      tabs,
      this.chunkSize,
      async (chunk) => {
        const input = tabsToRelaxedInput(chunk);
        const prompt = buildTabGroupingPrompt(input, { includeUrls: false });
        const response = await this.complete(prompt);
        return parseTabOrganization(response);
      },
      onProgress
        ? (current, total) =>
            onProgress(
              current,
              total,
              `Processing tabs (batch ${current}/${total})`,
            )
        : undefined,
      this.cooldownMs,
    );
  }

  async organizeBookmarks(
    bookmarks: BookmarkInfo[],
    onProgress?: ProgressCallback,
  ): Promise<BookmarkOrganizationResult> {
    return organizeBookmarksChunked(
      bookmarks,
      this.chunkSize,
      async (chunk) => {
        const input = bookmarksToRelaxedInput(chunk);
        const prompt = buildBookmarkOrganizePrompt(input, {
          includeUrls: false,
        });
        const response = await this.complete(prompt);
        const parsed = parseBookmarkOrganization(response);
        return {
          folders: parsed.folders.map((f) => ({
            ...f,
            parentId: undefined,
          })),
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
      this.cooldownMs,
    );
  }

  async suggestBookmarkLocation(
    bookmark: BookmarkInfo,
    folders: { id: string; path: string }[],
  ): Promise<LocationSuggestion[]> {
    // Limit folder list to fit in context window
    const maxFolders = this.backend === "chrome-ai" ? 50 : 200;
    const truncatedFolders = folders.slice(0, maxFolders);
    const input = { id: bookmark.id, title: bookmark.title };
    const prompt = buildBookmarkLocationPrompt(input, truncatedFolders, {
      includeUrls: false,
    });
    const response = await this.complete(prompt);
    return parseBookmarkLocation(response).suggestions;
  }

  private async complete(prompt: string): Promise<string> {
    if (this.backend === "chrome-ai") {
      return this.completeChromeAI(prompt);
    }
    return this.completeOllama(prompt);
  }

  private async completeChromeAI(prompt: string): Promise<string> {
    if (typeof LanguageModel === "undefined") {
      throw new Error(
        "Chrome Built-in AI is not available in this browser. Try Chrome 138+ or switch to Ollama in Settings.",
      );
    }

    const status = await LanguageModel.availability();
    if (status === "unavailable") {
      throw new Error(
        "Chrome Built-in AI model is unavailable. Switch to Ollama in Settings.",
      );
    }
    if (status === "downloadable" || status === "downloading") {
      throw new Error(
        `Chrome AI model is ${status}. Please wait for the download to complete, then try again.`,
      );
    }

    const session = await LanguageModel.create({
      systemPrompt:
        "You are a browser organization assistant. Always respond with valid JSON only.",
    });

    try {
      return await session.prompt(prompt);
    } finally {
      session.destroy();
    }
  }

  private async completeOllama(prompt: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(
        "http://localhost:11434/v1/chat/completions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: this.ollamaModel,
            messages: [
              {
                role: "system",
                content:
                  "You are a browser organization assistant. Always respond with valid JSON only.",
              },
              { role: "user", content: prompt },
            ],
            temperature: 0.3,
            stream: false,
          }),
        },
      );
    } catch {
      throw new Error(
        "Cannot connect to Ollama at localhost:11434. Make sure Ollama is running.",
      );
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Ollama error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("No content in Ollama response");
    return content;
  }
}

export async function checkLocalAIStatus(): Promise<LocalAIStatus> {
  let chromeAI: LocalAIStatus["chromeAI"] = "unavailable";
  try {
    if (typeof LanguageModel !== "undefined") {
      chromeAI = await LanguageModel.availability();
    }
  } catch {
    chromeAI = "unavailable";
  }

  let ollama: LocalAIStatus["ollama"] = "unavailable";
  let ollamaModels: string[] = [];
  try {
    const response = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(3000),
    });
    if (response.ok) {
      ollama = "available";
      const data = await response.json();
      ollamaModels = (data.models ?? []).map(
        (m: { name: string }) => m.name,
      );
    }
  } catch {
    ollama = "unavailable";
  }

  return { chromeAI, ollama, ollamaModels };
}

export async function triggerChromeAIDownload(): Promise<{
  status: LocalAIStatus["chromeAI"];
  error?: string;
}> {
  if (typeof LanguageModel === "undefined") {
    return { status: "unavailable", error: "LanguageModel API not found" };
  }

  const availability = await LanguageModel.availability();
  if (availability === "available") {
    return { status: "available" };
  }
  if (availability === "unavailable") {
    return {
      status: "unavailable",
      error: "Model is unavailable on this device",
    };
  }

  try {
    const session = await LanguageModel.create();
    session.destroy();
    return { status: "available" };
  } catch {
    const newStatus = await LanguageModel.availability();
    return { status: newStatus };
  }
}
