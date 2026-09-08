// Pure, dependency-free — near-duplicate detection. Exact duplicates
// (same normalized URL) already can't exist for one user: resources has a
// unique index on (user_id, normalized_url) since Phase 3/4. This module
// is about the different concern the phase spec calls out separately:
// two different URLs that are clearly the same saved thing (e.g. an old
// vs. new URL for the same tool, or a resource saved twice under a
// slightly different address) — never conflated with "similar resources"
// (different tools solving a related problem), which is what the existing
// Related Resources feature already covers via shared tags/category/stack.
import { tokenizeQuery } from "./search-highlight";

export interface DuplicateCandidateInput {
  id: string;
  title: string;
  domain: string;
  createdAt: string;
}

export interface DuplicateGroup {
  ids: string[];
  /** 0-1 — how confident this is really the same resource, not just related. */
  confidence: number;
}

function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(tokenizeQuery(a));
  const tokensB = new Set(tokenizeQuery(b));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let shared = 0;
  for (const t of tokensA) if (tokensB.has(t)) shared++;
  // Containment, not Jaccard: shared tokens over the SHORTER title's own
  // token count. A same-domain resource titled just "Squoosh" and another
  // titled "Squoosh — Image Compressor" is the realistic near-duplicate
  // shape (one title is essentially a superset of the other); Jaccard
  // would under-count that because of the longer title's extra words.
  // Two same-domain resources that just happen to share one word out of
  // many still won't cross the confidence threshold below.
  const shorter = Math.min(tokensA.size, tokensB.size);
  return shared / shorter;
}

const DUPLICATE_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Groups resources that are very likely the same saved thing: same domain
 * AND strongly overlapping title. Deliberately conservative — a missed
 * duplicate is far cheaper than wrongly flagging two different resources
 * (which the user would then have to notice and un-flag).
 */
export function findPossibleDuplicates(resources: DuplicateCandidateInput[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const used = new Set<string>();

  for (let i = 0; i < resources.length; i++) {
    if (used.has(resources[i].id)) continue;
    const group: string[] = [resources[i].id];
    let minConfidence = 1;

    for (let j = i + 1; j < resources.length; j++) {
      if (used.has(resources[j].id)) continue;
      if (resources[i].domain !== resources[j].domain) continue;
      const sim = titleSimilarity(resources[i].title, resources[j].title);
      if (sim >= DUPLICATE_CONFIDENCE_THRESHOLD) {
        group.push(resources[j].id);
        minConfidence = Math.min(minConfidence, sim);
      }
    }

    if (group.length > 1) {
      group.forEach((id) => used.add(id));
      groups.push({ ids: group, confidence: minConfidence });
    }
  }

  return groups;
}
