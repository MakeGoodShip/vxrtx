import { describe, it, expect } from "vitest";
import { buildTabGroupingPrompt } from "@/ai/prompts/tab-grouping";
import { buildBookmarkOrganizePrompt, buildBookmarkLocationPrompt } from "@/ai/prompts/bookmark-grouping";
import type { GroupingGranularity } from "@/shared/types";

const sampleTabs = [
  { id: 1, title: "GitHub - project", url: "https://github.com/test" },
  { id: 2, title: "Google Docs", url: "https://docs.google.com" },
  { id: 3, title: "Stack Overflow", lastAccessed: Date.now() - 86400000 * 10 },
];

const sampleBookmarks = [
  { id: "a1", title: "TypeScript Handbook", url: "https://typescriptlang.org" },
  { id: "a2", title: "MDN Web Docs", url: "https://developer.mozilla.org" },
];

// ─── Tab Prompt Builder ─────────────────────────────────────────────

describe("buildTabGroupingPrompt", () => {
  it("contains all required sections", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: true });
    expect(prompt).toContain("RULES:");
    expect(prompt).toContain("GROUPING DETAIL LEVEL:");
    expect(prompt).toContain("EXAMPLES:");
    expect(prompt).toContain("TABS:");
    expect(prompt).toContain("Respond with ONLY valid JSON");
  });

  it("includes few-shot examples with correct schema shape", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: false });
    expect(prompt).toContain('"groups"');
    expect(prompt).toContain('"stale"');
    expect(prompt).toContain('"duplicates"');
    expect(prompt).toContain('"reasoning"');
    expect(prompt).toContain('"color"');
    expect(prompt).toContain('"tabIds"');
  });

  it("includes tab data in the data block", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: true });
    expect(prompt).toContain("id:1");
    expect(prompt).toContain('title:"GitHub - project"');
    expect(prompt).toContain('url:"https://github.com/test"');
  });

  it("excludes URLs when includeUrls is false", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: false });
    expect(prompt).toContain("id:1");
    expect(prompt).toContain('title:"GitHub - project"');
    expect(prompt).not.toContain("https://github.com/test");
  });

  it("includes lastAccessed as days ago", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: false });
    expect(prompt).toMatch(/last_accessed:\d+d_ago/);
  });

  it.each([1, 2, 3, 4, 5] as GroupingGranularity[])(
    "produces different granularity instruction for level %i",
    (level) => {
      const prompt = buildTabGroupingPrompt(sampleTabs, {
        includeUrls: false,
        granularity: level,
      });
      expect(prompt).toContain(`GROUPING DETAIL LEVEL: ${level}/5`);
    },
  );

  it("has 3 few-shot examples", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: false });
    const exampleCount = (prompt.match(/Example \d/g) || []).length;
    expect(exampleCount).toBe(3);
  });

  it("places examples before real data", () => {
    const prompt = buildTabGroupingPrompt(sampleTabs, { includeUrls: false });
    const examplesPos = prompt.indexOf("EXAMPLES:");
    const dataPos = prompt.indexOf("TABS:");
    expect(examplesPos).toBeLessThan(dataPos);
  });
});

// ─── Bookmark Organize Prompt Builder ───────────────────────────────

describe("buildBookmarkOrganizePrompt", () => {
  it("contains all required sections", () => {
    const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, { includeUrls: true });
    expect(prompt).toContain("RULES:");
    expect(prompt).toContain("GROUPING DETAIL LEVEL:");
    expect(prompt).toContain("EXAMPLES:");
    expect(prompt).toContain("BOOKMARKS:");
    expect(prompt).toContain("Respond with ONLY valid JSON");
  });

  it("includes few-shot examples with correct schema shape", () => {
    const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, { includeUrls: false });
    expect(prompt).toContain('"folders"');
    expect(prompt).toContain('"bookmarkIds"');
    expect(prompt).toContain('"duplicates"');
    expect(prompt).toContain('"reasoning"');
  });

  it("includes bookmark data", () => {
    const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, { includeUrls: true });
    expect(prompt).toContain('id:"a1"');
    expect(prompt).toContain('title:"TypeScript Handbook"');
    expect(prompt).toContain('url:"https://typescriptlang.org"');
  });

  it("excludes URLs when includeUrls is false", () => {
    const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, { includeUrls: false });
    expect(prompt).not.toContain("https://typescriptlang.org");
  });

  it("has 3 few-shot examples", () => {
    const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, { includeUrls: false });
    const exampleCount = (prompt.match(/Example \d/g) || []).length;
    expect(exampleCount).toBe(3);
  });

  it.each([1, 2, 3, 4, 5] as GroupingGranularity[])(
    "produces different granularity instruction for level %i",
    (level) => {
      const prompt = buildBookmarkOrganizePrompt(sampleBookmarks, {
        includeUrls: false,
        granularity: level,
      });
      expect(prompt).toContain(`GROUPING DETAIL LEVEL: ${level}/5`);
    },
  );
});

// ─── Bookmark Location Prompt Builder ───────────────────────────────

describe("buildBookmarkLocationPrompt", () => {
  const folders = [
    { id: "f1", path: "Dev/Tools" },
    { id: "f2", path: "Reference" },
  ];

  it("includes bookmark and folder data", () => {
    const prompt = buildBookmarkLocationPrompt(
      { id: "a1", title: "Test", url: "https://test.com" },
      folders,
      { includeUrls: true },
    );
    expect(prompt).toContain('title:"Test"');
    expect(prompt).toContain('url:"https://test.com"');
    expect(prompt).toContain('path:"Dev/Tools"');
    expect(prompt).toContain("Respond with ONLY valid JSON");
  });

  it("excludes URL when includeUrls is false", () => {
    const prompt = buildBookmarkLocationPrompt(
      { id: "a1", title: "Test", url: "https://test.com" },
      folders,
      { includeUrls: false },
    );
    expect(prompt).not.toContain("https://test.com");
  });
});
