import { describe, it, expect, vi } from "vitest";
import {
  parseTabOrganization,
  parseBookmarkOrganization,
  parseBookmarkLocation,
  withRetry,
} from "@/ai/parser";

import tabsDevWorkflow from "./fixtures/tabs-dev-workflow.json";
import tabsMixedPersonal from "./fixtures/tabs-mixed-personal.json";
import tabsStaleDuplicates from "./fixtures/tabs-stale-duplicates.json";
import bookmarksDevTools from "./fixtures/bookmarks-dev-tools.json";
import bookmarksPersonalDuplicates from "./fixtures/bookmarks-personal-duplicates.json";

// ─── extractJson + parseTabOrganization ─────────────────────────────

describe("parseTabOrganization", () => {
  it("parses valid JSON from golden fixtures", () => {
    for (const fixture of [tabsDevWorkflow, tabsMixedPersonal, tabsStaleDuplicates]) {
      const result = parseTabOrganization(fixture.validResponse);
      expect(result.groups.length).toBeGreaterThan(0);
      expect(result.reasoning).toBeTruthy();
    }
  });

  it("parses JSON wrapped in code fences", () => {
    const wrapped = "```json\n" + tabsDevWorkflow.validResponse + "\n```";
    const result = parseTabOrganization(wrapped);
    expect(result.groups.length).toBeGreaterThan(0);
  });

  it("parses JSON embedded in prose", () => {
    const withProse = "Here are the suggested groups:\n\n" + tabsDevWorkflow.validResponse + "\n\nLet me know if you'd like changes.";
    const result = parseTabOrganization(withProse);
    expect(result.groups.length).toBeGreaterThan(0);
  });

  it("rejects empty group name", () => {
    const bad = JSON.stringify({
      groups: [{ name: "", color: "blue", tabIds: [1] }],
      stale: [],
      duplicates: [],
      reasoning: "test",
    });
    expect(() => parseTabOrganization(bad)).toThrow();
  });

  it("rejects whitespace-only group name", () => {
    const bad = JSON.stringify({
      groups: [{ name: "   ", color: "blue", tabIds: [1] }],
      stale: [],
      duplicates: [],
      reasoning: "test",
    });
    expect(() => parseTabOrganization(bad)).toThrow();
  });

  it("rejects empty tabIds array", () => {
    const bad = JSON.stringify({
      groups: [{ name: "Test", color: "blue", tabIds: [] }],
      stale: [],
      duplicates: [],
      reasoning: "test",
    });
    expect(() => parseTabOrganization(bad)).toThrow();
  });

  it("falls back invalid color to grey", () => {
    const response = JSON.stringify({
      groups: [{ name: "Test", color: "magenta", tabIds: [1] }],
      stale: [],
      duplicates: [],
      reasoning: "test",
    });
    const result = parseTabOrganization(response);
    expect(result.groups[0].color).toBe("grey");
  });

  it("throws JsonExtractionError for non-JSON text", () => {
    expect(() => parseTabOrganization("I cannot help with that.")).toThrow(
      "No valid JSON found",
    );
  });

  it("defaults optional fields when missing", () => {
    const minimal = JSON.stringify({
      groups: [{ name: "Test", color: "blue", tabIds: [1] }],
    });
    const result = parseTabOrganization(minimal);
    expect(result.stale).toEqual([]);
    expect(result.duplicates).toEqual([]);
    expect(result.reasoning).toBe("");
  });
});

// ─── parseBookmarkOrganization ──────────────────────────────────────

describe("parseBookmarkOrganization", () => {
  it("parses valid JSON from golden fixtures", () => {
    for (const fixture of [bookmarksDevTools, bookmarksPersonalDuplicates]) {
      const result = parseBookmarkOrganization(fixture.validResponse);
      expect(result.folders.length).toBeGreaterThan(0);
    }
  });

  it("rejects empty folder name", () => {
    const bad = JSON.stringify({
      folders: [{ name: "", bookmarkIds: ["a1"] }],
      duplicates: [],
      reasoning: "test",
    });
    expect(() => parseBookmarkOrganization(bad)).toThrow();
  });

  it("rejects empty bookmarkIds array", () => {
    const bad = JSON.stringify({
      folders: [{ name: "Test", bookmarkIds: [] }],
      duplicates: [],
      reasoning: "test",
    });
    expect(() => parseBookmarkOrganization(bad)).toThrow();
  });
});

// ─── parseBookmarkLocation ──────────────────────────────────────────

describe("parseBookmarkLocation", () => {
  it("parses valid location suggestions", () => {
    const response = JSON.stringify({
      suggestions: [
        { folderId: "f1", folderPath: "Dev/Tools", confidence: 0.9, reason: "Best match" },
        { folderId: "f2", folderPath: "Reference", confidence: 0.6, reason: "Possible" },
      ],
    });
    const result = parseBookmarkLocation(response);
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].confidence).toBe(0.9);
  });

  it("rejects confidence out of range", () => {
    const bad = JSON.stringify({
      suggestions: [
        { folderId: "f1", folderPath: "Test", confidence: 1.5, reason: "Bad" },
      ],
    });
    expect(() => parseBookmarkLocation(bad)).toThrow();
  });
});

// ─── withRetry ──────────────────────────────────────────────────────

describe("withRetry", () => {
  it("returns parsed result on first success", async () => {
    const complete = vi.fn().mockResolvedValue('{"value": 42}');
    const parse = vi.fn().mockReturnValue({ value: 42 });

    const result = await withRetry(complete, parse);
    expect(result).toEqual({ value: 42 });
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("retries once on parse failure and succeeds", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce("bad json")
      .mockResolvedValueOnce('{"value": 42}');

    let callCount = 0;
    const parse = vi.fn().mockImplementation((raw: string) => {
      callCount++;
      if (callCount === 1) throw new SyntaxError("Unexpected token");
      return { value: 42 };
    });

    const result = await withRetry(complete, parse);
    expect(result).toEqual({ value: 42 });
    expect(complete).toHaveBeenCalledTimes(2);
    // Second call should include error context
    expect(complete.mock.calls[1][0]).toContain("failed validation");
  });

  it("throws after both attempts fail", async () => {
    const complete = vi.fn().mockResolvedValue("not json");
    const parse = vi.fn().mockImplementation(() => {
      throw new SyntaxError("Unexpected token");
    });

    await expect(withRetry(complete, parse)).rejects.toThrow(
      "after 2 attempts",
    );
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("propagates API errors immediately without retry", async () => {
    const apiError = new Error("OpenRouter API error (401): Unauthorized");
    const complete = vi.fn().mockRejectedValue(apiError);
    const parse = vi.fn();

    await expect(withRetry(complete, parse)).rejects.toThrow("401");
    expect(complete).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
  });

  it("calls onStatus callback at each phase", async () => {
    const complete = vi.fn().mockResolvedValue('{"ok": true}');
    const parse = vi.fn().mockReturnValue({ ok: true });
    const onStatus = vi.fn();

    await withRetry(complete, parse, onStatus);
    expect(onStatus).toHaveBeenCalledWith("Waiting for AI response...");
    expect(onStatus).toHaveBeenCalledWith("Processing AI response...");
  });

  it("calls onStatus for retry phase", async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce("bad")
      .mockResolvedValueOnce('{"ok": true}');

    let callCount = 0;
    const parse = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) throw new SyntaxError("bad");
      return { ok: true };
    });
    const onStatus = vi.fn();

    await withRetry(complete, parse, onStatus);
    expect(onStatus).toHaveBeenCalledWith("Response invalid, retrying...");
  });
});
