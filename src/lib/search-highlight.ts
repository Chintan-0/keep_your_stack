// Pure, dependency-free helpers for the search UI — kept out of any React
// component per the phase spec (§58: "do not put the entire ranking
// algorithm inside a React component"). The actual ranking lives in
// Postgres (supabase/migrations/20260101000007_search_v2.sql); this file
// only covers client-side presentation: turning a query into highlightable
// tokens, and splitting text around them.

/**
 * Normalizes a query into meaningful search tokens: lowercased, split on
 * whitespace, punctuation collapsed EXCEPT the characters that carry real
 * meaning in developer vocabulary (. for "react.js"/"next.js", + for
 * "c++", # for "c#", - for "self-hosted"). Empty/short noise tokens are
 * dropped.
 */
export function tokenizeQuery(raw: string): string[] {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.+#-]/gu, " "); // strip punctuation other than the meaningful set above
  return cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Splits `text` into segments so the UI can render matched tokens with
 * emphasis. Matches whole tokens case-insensitively, longest-token-first
 * so "react.js" isn't shadowed by a shorter "react" token also present in
 * the query. Never matches inside an already-consumed span.
 */
export function highlightSegments(text: string, tokens: string[]): HighlightSegment[] {
  if (!text || tokens.length === 0) return [{ text, match: false }];

  const escaped = [...new Set(tokens)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (escaped.length === 0) return [{ text, match: false }];

  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const wholeMatch = new RegExp(`^(${escaped.join("|")})$`, "i");
  // String.split with a capturing group interleaves the captured
  // separators into the result — odd/even isn't reliable since a leading
  // match shifts it, so check each piece against the pattern directly
  // (a fresh, non-"g" regex — no lastIndex state to trip over) instead.
  return text
    .split(re)
    .filter((p) => p !== "")
    .map((part) => ({ text: part, match: wholeMatch.test(part) }));
}
