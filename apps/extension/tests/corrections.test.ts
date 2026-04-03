import { describe, it, expect } from "vitest";
import { extractCorrections, mergeCorrections, rankCorrections, correctionsBlock } from "@/core/corrections";
import type { TabInfo, TabGroupSuggestion, CorrectionSignal } from "@/shared/types";

const makeTabs = (entries: { id: number; url: string }[]): TabInfo[] =>
  entries.map((e) => ({
    id: e.id,
    title: `Tab ${e.id}`,
    url: e.url,
    pinned: false,
    groupId: -1,
    windowId: 1,
  }));

const tabs = makeTabs([
  { id: 1, url: "https://github.com/vxrtx" },
  { id: 2, url: "https://github.com/react" },
  { id: 3, url: "https://amazon.com/headphones" },
  { id: 4, url: "https://twitter.com/home" },
  { id: 5, url: "https://docs.google.com/doc1" },
]);

// ─── extractCorrections ─────────────────────────────────────────────

describe("extractCorrections", () => {
  it("detects when user renames a group", () => {
    const aiGroups: TabGroupSuggestion[] = [
      { name: "Reference", color: "blue", tabIds: [1, 2] },
      { name: "Shopping", color: "green", tabIds: [3] },
    ];
    const appliedGroups: TabGroupSuggestion[] = [
      { name: "Dev", color: "blue", tabIds: [1, 2] }, // renamed from Reference to Dev
      { name: "Shopping", color: "green", tabIds: [3] },
    ];

    const corrections = extractCorrections(aiGroups, appliedGroups, tabs);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].domain).toBe("github.com");
    expect(corrections[0].preferredGroup).toBe("Dev");
  });

  it("detects when user disables a group", () => {
    const aiGroups: TabGroupSuggestion[] = [
      { name: "Dev", color: "blue", tabIds: [1, 2] },
      { name: "Social", color: "cyan", tabIds: [4] },
    ];
    const appliedGroups: TabGroupSuggestion[] = [
      { name: "Dev", color: "blue", tabIds: [1, 2] },
      // Social group disabled — tab 4 not in any applied group
    ];

    const corrections = extractCorrections(aiGroups, appliedGroups, tabs);
    expect(corrections).toHaveLength(1);
    expect(corrections[0].domain).toBe("twitter.com");
    expect(corrections[0].rejectedGroup).toBe("Social");
  });

  it("returns empty for identical suggestions", () => {
    const groups: TabGroupSuggestion[] = [
      { name: "Dev", color: "blue", tabIds: [1, 2] },
    ];
    const corrections = extractCorrections(groups, groups, tabs);
    expect(corrections).toHaveLength(0);
  });

  it("deduplicates by domain", () => {
    // Two github.com tabs both moved from Reference to Dev
    const aiGroups: TabGroupSuggestion[] = [
      { name: "Reference", color: "blue", tabIds: [1, 2] },
    ];
    const appliedGroups: TabGroupSuggestion[] = [
      { name: "Dev", color: "blue", tabIds: [1, 2] },
    ];

    const corrections = extractCorrections(aiGroups, appliedGroups, tabs);
    // Should be 1, not 2 (both are github.com → Dev)
    expect(corrections).toHaveLength(1);
    expect(corrections[0].domain).toBe("github.com");
  });

  it("ignores tabs with invalid URLs", () => {
    const badTabs = makeTabs([{ id: 10, url: "chrome://extensions" }]);
    const aiGroups: TabGroupSuggestion[] = [
      { name: "Browser", color: "grey", tabIds: [10] },
    ];
    const appliedGroups: TabGroupSuggestion[] = [];

    const corrections = extractCorrections(aiGroups, appliedGroups, badTabs);
    expect(corrections).toHaveLength(0);
  });
});

// ─── mergeCorrections ───────────────────────────────────────────────

describe("mergeCorrections", () => {
  it("adds new corrections to empty store", () => {
    const incoming: CorrectionSignal[] = [
      { domain: "github.com", preferredGroup: "Dev", count: 1, lastSeen: 1000 },
    ];
    const result = mergeCorrections([], incoming);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(1);
  });

  it("increments count for matching correction", () => {
    const existing: CorrectionSignal[] = [
      { domain: "github.com", preferredGroup: "Dev", count: 2, lastSeen: 1000 },
    ];
    const incoming: CorrectionSignal[] = [
      { domain: "github.com", preferredGroup: "Dev", count: 1, lastSeen: 2000 },
    ];
    const result = mergeCorrections(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    expect(result[0].lastSeen).toBe(2000);
  });

  it("keeps different domain corrections separate", () => {
    const existing: CorrectionSignal[] = [
      { domain: "github.com", preferredGroup: "Dev", count: 1, lastSeen: 1000 },
    ];
    const incoming: CorrectionSignal[] = [
      { domain: "amazon.com", preferredGroup: "Shopping", count: 1, lastSeen: 2000 },
    ];
    const result = mergeCorrections(existing, incoming);
    expect(result).toHaveLength(2);
  });

  it("prunes to MAX_CORRECTIONS", () => {
    const existing: CorrectionSignal[] = Array.from({ length: 50 }, (_, i) => ({
      domain: `domain${i}.com`,
      preferredGroup: "Group",
      count: 1,
      lastSeen: i * 1000,
    }));
    const incoming: CorrectionSignal[] = [
      { domain: "new.com", preferredGroup: "New", count: 5, lastSeen: Date.now() },
    ];
    const result = mergeCorrections(existing, incoming);
    expect(result).toHaveLength(50);
    // The new high-weight correction should be present
    expect(result.some((c) => c.domain === "new.com")).toBe(true);
  });
});

// ─── rankCorrections ────────────────────────────────────────────────

describe("rankCorrections", () => {
  it("ranks by count × recency", () => {
    const now = Date.now();
    const corrections: CorrectionSignal[] = [
      { domain: "old.com", preferredGroup: "A", count: 10, lastSeen: now - 30 * 86400000 }, // old, high count
      { domain: "new.com", preferredGroup: "B", count: 3, lastSeen: now }, // recent, lower count
    ];
    const ranked = rankCorrections(corrections, now);
    // Recent correction should rank higher despite lower count
    expect(ranked[0].domain).toBe("new.com");
  });

  it("ranks equal-age by count", () => {
    const now = Date.now();
    const corrections: CorrectionSignal[] = [
      { domain: "low.com", preferredGroup: "A", count: 1, lastSeen: now },
      { domain: "high.com", preferredGroup: "B", count: 5, lastSeen: now },
    ];
    const ranked = rankCorrections(corrections, now);
    expect(ranked[0].domain).toBe("high.com");
  });
});

// ─── correctionsBlock ───────────────────────────────────────────────

describe("correctionsBlock", () => {
  it("returns empty string for no corrections", () => {
    expect(correctionsBlock([])).toBe("");
  });

  it("formats preferred group corrections", () => {
    const corrections: CorrectionSignal[] = [
      { domain: "github.com", preferredGroup: "Dev", count: 3, lastSeen: Date.now() },
    ];
    const block = correctionsBlock(corrections);
    expect(block).toContain("USER PREFERENCES");
    expect(block).toContain('github.com tabs → prefer "Dev"');
    expect(block).toContain("corrected 3x");
  });

  it("formats rejected group corrections", () => {
    const corrections: CorrectionSignal[] = [
      { domain: "twitter.com", rejectedGroup: "Reference", count: 1, lastSeen: Date.now() },
    ];
    const block = correctionsBlock(corrections);
    expect(block).toContain('twitter.com tabs → avoid "Reference"');
    expect(block).toContain("rejected 1x");
  });

  it("limits to maxItems", () => {
    const corrections: CorrectionSignal[] = Array.from({ length: 20 }, (_, i) => ({
      domain: `domain${i}.com`,
      preferredGroup: "Group",
      count: 1,
      lastSeen: Date.now(),
    }));
    const block = correctionsBlock(corrections, 5);
    const lines = block.split("\n").filter((l) => l.startsWith("- "));
    expect(lines).toHaveLength(5);
  });

  it("includes instruction to respect preferences", () => {
    const corrections: CorrectionSignal[] = [
      { domain: "test.com", preferredGroup: "Test", count: 1, lastSeen: Date.now() },
    ];
    const block = correctionsBlock(corrections);
    expect(block).toContain("Respect these preferences");
  });
});
