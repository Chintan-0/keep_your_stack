// Phase 15.6 — a small, shared semantic color system, used anywhere the
// UI needs to give a category/tag/metric a consistent accent (StackCard,
// ResourceCard, the Tag chip, the Home hero/metrics strip). Deliberately
// NOT a rainbow: every consumer picks from this same fixed palette, and
// the same input (a category or tag name) always maps to the same color
// — never randomized per render, never stored per-row in the database
// (categories/tags have no color column; this is presentation-only,
// computed from the name every time).

export type SemanticColor = "accent" | "blue" | "violet" | "cyan" | "success" | "warning" | "coral" | "orange" | "danger";

export const SEMANTIC_COLOR_CLASSES: Record<SemanticColor, { text: string; soft: string; dot: string }> = {
  accent: { text: "text-accent", soft: "bg-accent-soft", dot: "bg-accent" },
  blue: { text: "text-blue", soft: "bg-blue-soft", dot: "bg-blue" },
  violet: { text: "text-violet", soft: "bg-violet-soft", dot: "bg-violet" },
  cyan: { text: "text-cyan", soft: "bg-cyan-soft", dot: "bg-cyan" },
  success: { text: "text-success", soft: "bg-success-soft", dot: "bg-success" },
  warning: { text: "text-warning", soft: "bg-warning-soft", dot: "bg-warning" },
  coral: { text: "text-coral", soft: "bg-coral-soft", dot: "bg-coral" },
  orange: { text: "text-orange", soft: "bg-orange-soft", dot: "bg-orange" },
  danger: { text: "text-danger", soft: "bg-danger-soft", dot: "bg-danger" },
};

/** Simple, fast, deterministic string hash (same algorithm shape as faviconColor's, kept separate so tweaking one palette never shifts the other). */
function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

// Keyword → color for the category names a developer-tools library
// actually accumulates (§6). Matched case-insensitively, substring-based
// (so "AI & ML" matches "ai", "Frontend Development" matches
// "development"), since real user-created category names vary in exact
// wording. Anything that doesn't match falls back to a deterministic hash
// below the map — never random, never "no color."
const CATEGORY_KEYWORD_COLOR: [string, SemanticColor][] = [
  ["security", "danger"],
  ["database", "cyan"],
  ["design", "coral"],
  ["ai", "violet"],
  ["machine learning", "violet"],
  ["productivity", "warning"],
  ["reference", "success"],
  ["documentation", "success"],
  ["development", "blue"],
  ["devops", "orange"],
  ["deployment", "orange"],
  ["testing", "orange"],
  ["api", "blue"],
  ["utilities", "cyan"],
  ["utility", "cyan"],
];

const HASH_PALETTE: SemanticColor[] = ["blue", "violet", "cyan", "success", "warning", "coral", "orange"];

export function categoryColor(name: string | null | undefined): SemanticColor {
  if (!name) return "blue";
  const lower = name.toLowerCase();
  for (const [keyword, color] of CATEGORY_KEYWORD_COLOR) {
    if (lower.includes(keyword)) return color;
  }
  return HASH_PALETTE[hashString(lower) % HASH_PALETTE.length];
}

/** No semantic classification exists for tags — purely a deterministic visual hash, so the same tag name is always the same color (§8). */
export function tagColor(name: string): SemanticColor {
  return HASH_PALETTE[hashString(name.toLowerCase()) % HASH_PALETTE.length];
}
