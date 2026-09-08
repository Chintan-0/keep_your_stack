// Pure — deliberately dependency-free (no "server-only", no supabase-js)
// so it's directly unit-testable. Builds the honest "Why it matched" list
// straight from which fields the search SQL function actually matched
// (see supabase/migrations/20260101000007_search_v2.sql) — never a
// separately hardcoded explanation.
export interface MatchFlags {
  matched_title: boolean;
  matched_title_prefix: boolean;
  matched_use_cases: boolean;
  matched_tags: boolean;
  matched_category: boolean;
  matched_stacks: boolean;
  matched_description: boolean;
  matched_notes: boolean;
  matched_domain: boolean;
  matched_folder: boolean;
}

/** Ordered by the same weight tiers the ranking uses (very high -> low), so the strongest real reason for a match appears first. */
export function buildMatchLabels(row: MatchFlags): string[] {
  const labels: string[] = [];
  if (row.matched_title || row.matched_title_prefix) labels.push("Title");
  if (row.matched_use_cases) labels.push("Useful For");
  if (row.matched_tags) labels.push("Tag");
  if (row.matched_description) labels.push("Description");
  if (row.matched_category) labels.push("Category");
  if (row.matched_stacks) labels.push("Stack");
  if (row.matched_notes) labels.push("Note");
  if (row.matched_domain) labels.push("Domain");
  if (row.matched_folder) labels.push("Imported folder");
  return labels;
}
