import type { TabInfo, TabGroupSuggestion, CorrectionSignal } from "@/shared/types";
import { MAX_CORRECTIONS } from "@/shared/constants";

/** Half-life for recency decay in days. */
const DECAY_HALF_LIFE_DAYS = 14;

/**
 * Extract domain from a URL. Returns empty string for invalid/chrome URLs.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Compare AI-suggested groups with what the user actually applied.
 * Returns new correction signals for domains that were moved or rejected.
 */
export function extractCorrections(
  aiGroups: TabGroupSuggestion[],
  appliedGroups: TabGroupSuggestion[],
  tabs: TabInfo[],
): CorrectionSignal[] {
  const tabMap = new Map(tabs.map((t) => [t.id, t]));
  const now = Date.now();

  // Build AI assignment: tabId → groupName
  const aiAssignment = new Map<number, string>();
  for (const group of aiGroups) {
    for (const tabId of group.tabIds) {
      aiAssignment.set(tabId, group.name);
    }
  }

  // Build applied assignment: tabId → groupName
  const appliedAssignment = new Map<number, string>();
  for (const group of appliedGroups) {
    for (const tabId of group.tabIds) {
      appliedAssignment.set(tabId, group.name);
    }
  }

  // Find corrections: tabs that ended up in a different group than AI suggested
  const corrections: CorrectionSignal[] = [];
  const seen = new Set<string>(); // dedup by domain+preferredGroup

  for (const [tabId, aiGroup] of aiAssignment) {
    const appliedGroup = appliedAssignment.get(tabId);
    const tab = tabMap.get(tabId);
    if (!tab) continue;

    const domain = extractDomain(tab.url);
    if (!domain) continue;

    if (appliedGroup && appliedGroup !== aiGroup) {
      // Tab moved to a different group — explicit correction
      const key = `${domain}:prefer:${appliedGroup}`;
      if (!seen.has(key)) {
        seen.add(key);
        corrections.push({
          domain,
          preferredGroup: appliedGroup,
          count: 1,
          lastSeen: now,
          source: "correction",
        });
      }
    } else if (!appliedGroup) {
      // Tab was in AI suggestion but not in applied (group was disabled/tab removed)
      const key = `${domain}:reject:${aiGroup}`;
      if (!seen.has(key)) {
        seen.add(key);
        corrections.push({
          domain,
          rejectedGroup: aiGroup,
          count: 1,
          lastSeen: now,
          source: "correction",
        });
      }
    } else if (appliedGroup === aiGroup) {
      // Tab accepted as-is — implicit affinity signal
      const key = `${domain}:accept:${aiGroup}`;
      if (!seen.has(key)) {
        seen.add(key);
        corrections.push({
          domain,
          preferredGroup: aiGroup,
          count: 1,
          lastSeen: now,
          source: "acceptance",
        });
      }
    }
  }

  return corrections;
}

/**
 * Merge new corrections into existing stored corrections.
 * Upserts by domain + preferredGroup/rejectedGroup, increments count, updates lastSeen.
 * Prunes to MAX_CORRECTIONS by removing lowest-weight entries.
 */
export function mergeCorrections(
  existing: CorrectionSignal[],
  incoming: CorrectionSignal[],
): CorrectionSignal[] {
  const merged = [...existing];

  for (const signal of incoming) {
    const matchIdx = merged.findIndex(
      (c) =>
        c.domain === signal.domain &&
        c.preferredGroup === signal.preferredGroup &&
        c.rejectedGroup === signal.rejectedGroup,
    );

    if (matchIdx >= 0) {
      merged[matchIdx] = {
        ...merged[matchIdx],
        count: merged[matchIdx].count + 1,
        lastSeen: Math.max(merged[matchIdx].lastSeen, signal.lastSeen),
        // Upgrade to "correction" if either signal is an explicit correction
        source: merged[matchIdx].source === "correction" || signal.source === "correction"
          ? "correction"
          : "acceptance",
      };
    } else {
      merged.push(signal);
    }
  }

  // Prune to MAX_CORRECTIONS by removing lowest-weight entries
  if (merged.length > MAX_CORRECTIONS) {
    const ranked = rankCorrections(merged);
    return ranked.slice(0, MAX_CORRECTIONS);
  }

  return merged;
}

/** Weight multiplier: explicit corrections are 2x stronger than implicit acceptances. */
const ACCEPTANCE_WEIGHT = 0.5;

/**
 * Calculate decay weight for a correction signal.
 * weight = count * sourceMultiplier * exp(-daysSinceLastSeen / halfLife)
 */
function decayWeight(signal: CorrectionSignal, now = Date.now()): number {
  const daysSince = (now - signal.lastSeen) / (1000 * 60 * 60 * 24);
  const sourceMultiplier = signal.source === "acceptance" ? ACCEPTANCE_WEIGHT : 1;
  return signal.count * sourceMultiplier * Math.exp(-daysSince / DECAY_HALF_LIFE_DAYS);
}

/**
 * Rank corrections by decayed weight (highest first).
 */
export function rankCorrections(
  corrections: CorrectionSignal[],
  now = Date.now(),
): CorrectionSignal[] {
  return [...corrections].sort(
    (a, b) => decayWeight(b, now) - decayWeight(a, now),
  );
}

/**
 * Format top corrections as a prompt context block.
 * Returns empty string if no corrections.
 */
export function correctionsBlock(
  corrections: CorrectionSignal[],
  maxItems = 10,
): string {
  if (corrections.length === 0) return "";

  const ranked = rankCorrections(corrections);
  const top = ranked.slice(0, maxItems);

  const lines = top.map((c) => {
    if (c.rejectedGroup) {
      return `- ${c.domain} tabs → avoid "${c.rejectedGroup}" (rejected ${c.count}x)`;
    }
    if (c.source === "acceptance") {
      return `- ${c.domain} tabs → "${c.preferredGroup}" works well (confirmed ${c.count}x)`;
    }
    return `- ${c.domain} tabs → prefer "${c.preferredGroup}" (corrected ${c.count}x)`;
  });

  return `USER PREFERENCES (learned from your past corrections):\n${lines.join("\n")}\nRespect these preferences when grouping the tabs below.`;
}
