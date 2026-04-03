import { describe, it, expect } from "vitest";
import { scoreTabGrouping, scoreBookmarkGrouping } from "./scoring";

import tabsDevWorkflow from "./fixtures/tabs-dev-workflow.json";
import bookmarksDevTools from "./fixtures/bookmarks-dev-tools.json";

describe("scoreTabGrouping", () => {
  it("returns perfect score for exact match", () => {
    const groups = [
      { name: "vxrtx Dev", tabIds: [1, 3, 8] },
      { name: "Documentation", tabIds: [2, 5, 6] },
      { name: "Project Mgmt", tabIds: [4] },
      { name: "Design", tabIds: [7] },
    ];
    const result = scoreTabGrouping(groups, tabsDevWorkflow.goldenLabels);
    expect(result.precision).toBe(1);
    expect(result.correctCount).toBe(8);
    expect(result.totalLabeled).toBe(8);
    expect(result.groupCountDelta).toBe(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it("detects partial mismatches", () => {
    const groups = [
      { name: "vxrtx Dev", tabIds: [1, 3] },         // missing 8
      { name: "Documentation", tabIds: [2, 5, 6, 8] }, // 8 is wrong
      { name: "Project Mgmt", tabIds: [4] },
      { name: "Design", tabIds: [7] },
    ];
    const result = scoreTabGrouping(groups, tabsDevWorkflow.goldenLabels);
    expect(result.precision).toBe(7 / 8);
    expect(result.correctCount).toBe(7);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0]).toEqual({
      itemId: "8",
      expected: "vxrtx Dev",
      actual: "Documentation",
    });
  });

  it("handles completely wrong grouping", () => {
    const groups = [
      { name: "Wrong", tabIds: [1, 2, 3, 4, 5, 6, 7, 8] },
    ];
    const result = scoreTabGrouping(groups, tabsDevWorkflow.goldenLabels);
    expect(result.precision).toBe(0);
    expect(result.groupCountDelta).toBe(1 - 4); // 1 actual - 4 expected
    expect(result.mismatches).toHaveLength(8);
  });

  it("handles unassigned items", () => {
    const groups = [
      { name: "vxrtx Dev", tabIds: [1, 3, 8] },
      // items 2, 4, 5, 6, 7 not assigned
    ];
    const result = scoreTabGrouping(groups, tabsDevWorkflow.goldenLabels);
    expect(result.correctCount).toBe(3);
    expect(result.mismatches).toHaveLength(5);
    expect(result.mismatches[0].actual).toBe("(unassigned)");
  });

  it("reports positive groupCountDelta for too many groups", () => {
    const groups = [
      { name: "vxrtx Dev", tabIds: [1, 3, 8] },
      { name: "Documentation", tabIds: [2, 5, 6] },
      { name: "Project Mgmt", tabIds: [4] },
      { name: "Design", tabIds: [7] },
      { name: "Extra Group", tabIds: [99] },
    ];
    const result = scoreTabGrouping(groups, tabsDevWorkflow.goldenLabels);
    expect(result.groupCountDelta).toBe(1); // 5 actual - 4 expected
  });

  it("handles empty inputs", () => {
    const result = scoreTabGrouping([], {});
    expect(result.precision).toBe(1); // vacuously true
    expect(result.totalLabeled).toBe(0);
  });
});

describe("scoreBookmarkGrouping", () => {
  it("returns perfect score for exact match", () => {
    const folders = [
      { name: "Documentation", bookmarkIds: ["a1", "a3", "a5"] },
      { name: "GitHub Repos", bookmarkIds: ["a2", "a6"] },
      { name: "Dev Tools", bookmarkIds: ["a4"] },
    ];
    const result = scoreBookmarkGrouping(folders, bookmarksDevTools.goldenLabels);
    expect(result.precision).toBe(1);
    expect(result.correctCount).toBe(6);
    expect(result.groupCountDelta).toBe(0);
  });

  it("detects mismatches in bookmark grouping", () => {
    const folders = [
      { name: "Documentation", bookmarkIds: ["a1", "a3", "a4", "a5"] }, // a4 wrong
      { name: "GitHub Repos", bookmarkIds: ["a2", "a6"] },
    ];
    const result = scoreBookmarkGrouping(folders, bookmarksDevTools.goldenLabels);
    expect(result.precision).toBe(5 / 6);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].itemId).toBe("a4");
  });
});
