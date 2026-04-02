import { z } from "zod";
import type { TabOrganizationAIResult } from "./types";
import type { TabGroupColor } from "@/shared/types";

const TAB_GROUP_COLORS: TabGroupColor[] = [
  "grey", "blue", "red", "yellow", "green", "pink", "purple", "cyan", "orange",
];

const TabGroupSuggestionSchema = z.object({
  name: z.string(),
  color: z.string().transform((c) =>
    TAB_GROUP_COLORS.includes(c as TabGroupColor) ? c as TabGroupColor : "grey"
  ),
  tabIds: z.array(z.number()),
});

const TabOrganizationSchema = z.object({
  groups: z.array(TabGroupSuggestionSchema),
  stale: z.array(z.number()).default([]),
  duplicates: z.array(z.array(z.number())).default([]),
  reasoning: z.string().default(""),
});

const BookmarkFolderSchema = z.object({
  name: z.string(),
  bookmarkIds: z.array(z.string()),
});

const BookmarkOrganizationSchema = z.object({
  folders: z.array(BookmarkFolderSchema),
  duplicates: z.array(z.array(z.string())).default([]),
  reasoning: z.string().default(""),
});

const LocationSuggestionSchema = z.object({
  folderId: z.string(),
  folderPath: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});

const BookmarkLocationSchema = z.object({
  suggestions: z.array(LocationSuggestionSchema),
});

/**
 * Retry wrapper: attempts parse, on failure retries the LLM call with error context.
 * Max 1 retry (2 total attempts). Only retries on parse failures — API errors propagate immediately.
 */
export async function withRetry<T>(
  completeFn: (errorContext?: string) => Promise<string>,
  parseFn: (raw: string) => T,
): Promise<T> {
  // First attempt: let API errors propagate, only catch parse failures
  const raw = await completeFn();
  try {
    return parseFn(raw);
  } catch (parseErr) {
    // Parse failed — retry with error context
    const errMsg = (parseErr instanceof Error ? parseErr.message : String(parseErr)).slice(0, 500);
    const errorContext = `Your previous response failed validation: ${errMsg}. Return ONLY valid JSON matching the schema exactly.`;
    const retryRaw = await completeFn(errorContext);
    try {
      return parseFn(retryRaw);
    } catch (secondErr) {
      throw new Error(
        `AI response could not be parsed after 2 attempts. Last error: ${secondErr instanceof Error ? secondErr.message : String(secondErr)}`,
        { cause: secondErr },
      );
    }
  }
}

export function parseTabOrganization(raw: string): TabOrganizationAIResult {
  const json = extractJson(raw);
  const parsed = TabOrganizationSchema.parse(json);
  return parsed as TabOrganizationAIResult;
}

export function parseBookmarkOrganization(raw: string) {
  const json = extractJson(raw);
  return BookmarkOrganizationSchema.parse(json);
}

export function parseBookmarkLocation(raw: string) {
  const json = extractJson(raw);
  return BookmarkLocationSchema.parse(json);
}

function extractJson(text: string): unknown {
  // Try parsing the whole string first
  try {
    return JSON.parse(text);
  } catch {
    // Look for JSON in code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1].trim());
    }

    // Look for first { to last }
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    }

    throw new Error("No valid JSON found in AI response");
  }
}
