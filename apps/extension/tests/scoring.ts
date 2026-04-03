/**
 * Grouping quality scoring utility.
 * Compares AI grouping output against golden labels to measure classification accuracy.
 */

export interface ScoringResult {
  /** Fraction of items assigned to the correct group (0-1). */
  precision: number;
  /** Number of items that matched the golden label. */
  correctCount: number;
  /** Total number of items with golden labels. */
  totalLabeled: number;
  /** Difference in group count: actual - expected. Positive = too many groups. */
  groupCountDelta: number;
  /** Items that were assigned to the wrong group. */
  mismatches: { itemId: string; expected: string; actual: string }[];
}

/**
 * Score tab grouping results against golden labels.
 *
 * @param groups - AI result groups: { name, tabIds }[]
 * @param goldenLabels - Map of tabId (as string) → expected group name
 * @returns ScoringResult with precision and mismatch details
 */
export function scoreTabGrouping(
  groups: { name: string; tabIds: number[] }[],
  goldenLabels: Record<string, string>,
): ScoringResult {
  // Build reverse map: itemId → assigned group name
  const assignments = new Map<string, string>();
  for (const group of groups) {
    for (const tabId of group.tabIds) {
      assignments.set(String(tabId), group.name);
    }
  }

  return computeScore(assignments, goldenLabels, groups.length);
}

/**
 * Score bookmark grouping results against golden labels.
 *
 * @param folders - AI result folders: { name, bookmarkIds }[]
 * @param goldenLabels - Map of bookmarkId → expected folder name
 * @returns ScoringResult with precision and mismatch details
 */
export function scoreBookmarkGrouping(
  folders: { name: string; bookmarkIds: string[] }[],
  goldenLabels: Record<string, string>,
): ScoringResult {
  const assignments = new Map<string, string>();
  for (const folder of folders) {
    for (const bmId of folder.bookmarkIds) {
      assignments.set(bmId, folder.name);
    }
  }

  return computeScore(assignments, goldenLabels, folders.length);
}

function computeScore(
  assignments: Map<string, string>,
  goldenLabels: Record<string, string>,
  actualGroupCount: number,
): ScoringResult {
  const labelEntries = Object.entries(goldenLabels);
  const expectedGroupNames = new Set(Object.values(goldenLabels));

  let correctCount = 0;
  const mismatches: ScoringResult["mismatches"] = [];

  for (const [itemId, expectedGroup] of labelEntries) {
    const actualGroup = assignments.get(itemId);
    if (actualGroup === expectedGroup) {
      correctCount++;
    } else {
      mismatches.push({
        itemId,
        expected: expectedGroup,
        actual: actualGroup ?? "(unassigned)",
      });
    }
  }

  return {
    precision: labelEntries.length > 0 ? correctCount / labelEntries.length : 1,
    correctCount,
    totalLabeled: labelEntries.length,
    groupCountDelta: actualGroupCount - expectedGroupNames.size,
    mismatches,
  };
}
