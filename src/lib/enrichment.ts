// Deterministic, explainable resource enrichment — NOT an AI/LLM system.
// Every function here either returns a value backed by real evidence
// (title/description/domain/folder text) or returns null/empty. Nothing
// is invented: a resource with no matching signal gets no suggestion,
// full stop. See src/lib/data/enrichment.ts for how these are applied to
// a real resource (respecting user edits, tracking source/status).
import type { Category } from "./types";
import { suggestCategoryForFolder } from "./import-organizer";

export type Confidence = "high" | "medium" | "low";

// ── Description cleaning ────────────────────────────────────────────────

const MAX_DESCRIPTION_LENGTH = 220;

/**
 * Normalizes a raw extracted description: strips HTML/entities that leaked
 * through, collapses whitespace, drops an obvious trailing "| Site Name"
 * suffix, and caps length at a sentence boundary rather than a hard
 * mid-word cut. Never invents content — an empty/unusable input stays empty.
 */
export function cleanDescription(raw: string | null | undefined): string {
  if (!raw) return "";
  let text = raw
    .replace(/<[^>]*>/g, " ") // strip any stray HTML tags
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  // Strip one obvious "Title | Site Name" style trailing suffix — but only
  // the last pattern (trailing " - X"), which is easy to get wrong, so we
  // require what's left to still be a reasonable sentence (not empty).
  const pipeSplit = text.match(/^(.{20,}?)\s*\|\s*[^|]{1,40}$/);
  if (pipeSplit) text = pipeSplit[1].trim();

  if (text.length > MAX_DESCRIPTION_LENGTH) {
    const truncated = text.slice(0, MAX_DESCRIPTION_LENGTH);
    const lastSentence = truncated.match(/^(.*[.!?])\s/);
    const lastSpace = truncated.lastIndexOf(" ");
    text = (lastSentence ? lastSentence[1] : truncated.slice(0, lastSpace > 0 ? lastSpace : MAX_DESCRIPTION_LENGTH)).trim();
    if (!/[.!?]$/.test(text)) text += "…";
  }
  return text;
}

// ── Tag normalization ───────────────────────────────────────────────────

// KeepYourStack's tags have always been lowercase slugs (see
// src/lib/demo-data.ts's tag list, and src/lib/data/tags.ts's ensureTags,
// which lowercases on write) — this keeps enrichment-suggested tags
// visually and mechanically consistent with that, rather than inventing a
// second casing convention. A few common synonyms collapse to one
// canonical slug so "js"/"javascript" don't become two different tags.
const TAG_SYNONYMS: Record<string, string> = {
  js: "javascript", "node.js": "node", nodejs: "node", "next.js": "nextjs",
  "vue.js": "vue", "ci/cd": "ci-cd", cicd: "ci-cd", postgresql: "postgres",
  "open source": "open-source", "qr code": "qr-code", "self hosted": "self-hosted",
};

/** Canonical slug form of a tag name, for de-duplication (React/react/REACT -> "react"). */
export function normalizeTagName(raw: string): string {
  const trimmed = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!trimmed) return "";
  return TAG_SYNONYMS[trimmed] ?? trimmed;
}

/** De-duplicates by normalized form, keeping the first occurrence's canonical casing. */
export function dedupeTags(names: string[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of names) {
    const canonical = normalizeTagName(raw);
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (!seen.has(key)) seen.set(key, canonical);
  }
  return Array.from(seen.values());
}

export const MAX_SUGGESTED_TAGS = 6;

// Keyword -> tag(s). Matched as whole-word-ish substrings against combined
// lowercased title+description+domain text. Order doesn't matter — all
// matches are collected, deduped, then capped.
const TAG_RULES: { pattern: RegExp; tags: string[] }[] = [
  { pattern: /\breact\b/, tags: ["react"] },
  { pattern: /\bvue(\.?js)?\b/, tags: ["vue"] },
  { pattern: /\bsvelte\b/, tags: ["svelte"] },
  { pattern: /\bnext\.?js\b/, tags: ["nextjs", "react"] },
  { pattern: /\btypescript\b/, tags: ["typescript"] },
  { pattern: /\bgraphql\b/, tags: ["graphql", "api"] },
  { pattern: /\brest(ful)?\s+api\b|\bapi\s+(client|testing|tool)\b|\bapi\b/, tags: ["api"] },
  { pattern: /\bhttp\b/, tags: ["http"] },
  { pattern: /\btest(ing)?\b/, tags: ["testing"] },
  { pattern: /\bimage(s)?\b/, tags: ["images"] },
  { pattern: /\bcompress(ion|or)?\b|\boptimi[sz](e|ation)\b/, tags: ["compression"] },
  { pattern: /\bwebp\b|\bavif\b/, tags: ["images", "webp"] },
  { pattern: /\bsvg\b/, tags: ["svg"] },
  { pattern: /\bicon(s)?\b/, tags: ["icons"] },
  { pattern: /\bfont(s)?\b|\btypeface\b/, tags: ["fonts"] },
  { pattern: /\banimat(e|ion|ed)\b/, tags: ["animation"] },
  { pattern: /\bcomponent(s)?\b|\bui\s+(kit|library)\b/, tags: ["components", "ui"] },
  { pattern: /\bdesign\b|\bprototyp(e|ing)\b/, tags: ["design"] },
  { pattern: /\bwireframe\b/, tags: ["ui"] },
  { pattern: /\bdatabase\b|\bpostgres\b|\bsql\b/, tags: ["database"] },
  { pattern: /\bredis\b/, tags: ["database"] },
  { pattern: /\bauth(entication|orization)?\b/, tags: ["auth"] },
  { pattern: /\bdocker\b|\bkubernetes\b|\bk8s\b/, tags: ["docker"] },
  { pattern: /\bci\/cd\b|\bcontinuous (integration|deployment)\b/, tags: ["ci-cd"] },
  { pattern: /\bmonitor(ing)?\b|\berror tracking\b|\bobservability\b/, tags: ["monitoring"] },
  { pattern: /\bmarkdown\b/, tags: ["markdown"] },
  { pattern: /\bregex\b|\bregular expression/, tags: ["regex"] },
  { pattern: /\bjson\b/, tags: ["json"] },
  { pattern: /\bqr code\b/, tags: ["qr-code"] },
  { pattern: /\bcli\b|\bcommand.line\b/, tags: ["cli"] },
  { pattern: /\bself.hosted\b/, tags: ["self-hosted"] },
  { pattern: /\bopen.source\b/, tags: ["open-source"] },
  { pattern: /\bmachine learning\b|\bmodel(s)?\b.*\binfer/, tags: ["ai"] },
  { pattern: /\bllm\b|\bartificial intelligence\b|\bai\b/, tags: ["ai"] },
  { pattern: /\bvideo\b/, tags: ["video"] },
  { pattern: /\baccessibility\b|\ba11y\b/, tags: ["accessibility"] },
];

/**
 * Suggests up to MAX_SUGGESTED_TAGS canonical tags from real text evidence
 * (title/description/domain). Returns [] rather than guessing when nothing
 * matches — never pads out to a target count with filler.
 */
export function suggestTags(input: { title?: string; description?: string; domain?: string }): string[] {
  const text = `${input.title ?? ""} ${input.description ?? ""} ${input.domain ?? ""}`.toLowerCase();
  const matched: string[] = [];
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) matched.push(...rule.tags);
  }
  return dedupeTags(matched).slice(0, MAX_SUGGESTED_TAGS);
}

// ── Useful For ───────────────────────────────────────────────────────────

// Ordered: first match wins. Each is deliberately specific (verb + object)
// rather than a vague "developer tool" catch-all — see the phase spec's
// explicit ban on vague phrasing.
const USEFUL_FOR_RULES: { pattern: RegExp; usefulFor: string; confidence: Confidence }[] = [
  { pattern: /\bcompress(ion|or)?\b.*\bimage|image.*\bcompress/, usefulFor: "Compress and optimize images", confidence: "high" },
  { pattern: /\boptimi[sz]e?\b.*\bimage|image.*\boptimi[sz]/, usefulFor: "Compress and optimize images", confidence: "high" },
  { pattern: /\bimage(s)?\b.*\bsmaller|\bsmaller\b.*\bimage(s)?\b|\bshrink\b.*\bimage/, usefulFor: "Compress and optimize images", confidence: "high" },
  { pattern: /\bsvg\b.*\breact|react.*\bsvg\b/, usefulFor: "Convert SVG files into React components", confidence: "high" },
  { pattern: /\bqr code\b/, usefulFor: "Generate QR codes", confidence: "high" },
  { pattern: /\bgraphql\b.*\b(client|api|test|debug)|test.*\bgraphql\b/, usefulFor: "Test and debug GraphQL APIs", confidence: "high" },
  { pattern: /\brest\b.*\bapi\b.*\b(client|test)|api.*\b(client|testing tool)\b/, usefulFor: "Test and debug APIs", confidence: "high" },
  { pattern: /\bapi\b.*\bclient\b|\bhttp\b.*\bclient\b/, usefulFor: "Test and debug APIs", confidence: "medium" },
  { pattern: /\banimat(ed|ion)\b.*\breact\b.*\b(component|ui)|react.*\banimat/, usefulFor: "Build animated React UI components", confidence: "high" },
  { pattern: /\breact\b.*\bcomponent(s)?\b|\bcomponent(s)?\b.*\breact\b/, usefulFor: "Build React interfaces", confidence: "medium" },
  { pattern: /\bicon(s)?\b.*\blibrary|\bbrowse\b.*\bicon/, usefulFor: "Browse open-source icons", confidence: "high" },
  { pattern: /\bfont(s)?\b.*\b(browse|library|free)/, usefulFor: "Browse and pair web fonts", confidence: "medium" },
  { pattern: /\bmarkdown\b.*\b(editor|preview)/, usefulFor: "Write and preview Markdown", confidence: "high" },
  { pattern: /\bregex\b.*\b(test|debug|build)|test.*\bregex\b/, usefulFor: "Test and debug regular expressions", confidence: "high" },
  { pattern: /\bjson\b.*\b(format|validate|viewer)/, usefulFor: "Format and validate JSON", confidence: "high" },
  { pattern: /\bdesign\b.*\bprototyp|\bprototyp.*\binterface/, usefulFor: "Design and prototype interfaces", confidence: "high" },
  { pattern: /\bwireframe\b/, usefulFor: "Design and prototype interfaces", confidence: "medium" },
  { pattern: /\bcolor palette\b|\bcolor scheme\b/, usefulFor: "Generate color palettes", confidence: "high" },
  { pattern: /\bmonitor(ing)?\b.*\berror|error.*\btrack/, usefulFor: "Monitor application errors", confidence: "high" },
  { pattern: /\bci\/cd\b|\bcontinuous (integration|deployment)\b/, usefulFor: "Automate build and deployment pipelines", confidence: "medium" },
  { pattern: /\bcontainer(s|ize)?\b.*\bdeploy|\bdocker\b/, usefulFor: "Package and deploy containerized apps", confidence: "medium" },
  { pattern: /\bdatabase\b.*\b(client|browser|manage)/, usefulFor: "Browse and manage a database", confidence: "medium" },
  { pattern: /\bauth(entication)?\b.*\b(add|integrate|provider)/, usefulFor: "Add authentication to an app", confidence: "medium" },
  { pattern: /\bvideo\b.*\b(edit|convert)/, usefulFor: "Edit or convert video files", confidence: "medium" },
];

/**
 * Suggests one Useful-For phrase from title/description text, with a
 * confidence tied to how specific the matched evidence was. Returns null
 * when nothing matches — never falls back to a generic "developer tool"
 * placeholder.
 */
export function suggestUsefulFor(input: {
  title?: string;
  description?: string;
}): { value: string; confidence: Confidence } | null {
  const text = `${input.title ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  for (const rule of USEFUL_FOR_RULES) {
    if (rule.pattern.test(text)) return { value: rule.usefulFor, confidence: rule.confidence };
  }
  return null;
}

// ── Category suggestion ─────────────────────────────────────────────────

// Domain -> category-name hint. Weak on its own (per the phase spec's
// confidence hierarchy) — only ever offered at "low" confidence, and only
// if a category with that exact name already exists; never creates one.
const DOMAIN_CATEGORY_HINTS: { pattern: RegExp; categoryName: string }[] = [
  { pattern: /(^|\.)figma\.com$/, categoryName: "Design" },
  { pattern: /(^|\.)dribbble\.com$/, categoryName: "Design" },
  { pattern: /(^|\.)behance\.net$/, categoryName: "Design" },
  { pattern: /(^|\.)github\.com$/, categoryName: "Development" },
  { pattern: /(^|\.)gitlab\.com$/, categoryName: "Development" },
  { pattern: /(^|\.)npmjs\.com$/, categoryName: "Development" },
  { pattern: /(^|\.)docker\.com$/, categoryName: "DevOps" },
];

// ── User-edit protection ────────────────────────────────────────────────
// The actual rule behind "never invent over a manual edit" (phase spec
// §6/§29): once a field is user-authored, enrichment may never touch it
// again — only refill it while it's still empty or itself system-authored.

export function canOverwriteDescription(resource: { description: string; descriptionSource: string | null }): boolean {
  return !resource.description || resource.descriptionSource !== "user";
}

export function canOverwriteUsefulFor(resource: { useCases: string[]; usefulForSource: string | null }): boolean {
  return resource.useCases.length === 0 || resource.usefulForSource !== "user";
}

export interface CategorySuggestion {
  categoryId: string;
  confidence: Confidence;
}

/**
 * Suggests an existing category id from folder (high), tag/text keyword
 * match against an existing category's own name (medium), or domain (low)
 * — in that order, strongest signal first. Never proposes creating a new
 * category; a resource with no matching existing category gets null.
 */
export function suggestCategoryForResource(
  input: { title?: string; description?: string; domain?: string; folder?: string | null },
  categories: Category[]
): CategorySuggestion | null {
  if (input.folder) {
    const fromFolder = suggestCategoryForFolder(input.folder, categories);
    if (fromFolder) return { categoryId: fromFolder, confidence: "high" };
  }

  const text = `${input.title ?? ""} ${input.description ?? ""}`.toLowerCase();
  if (text.trim()) {
    const byName = categories.find((c) => text.includes(c.name.toLowerCase()) && c.name.length > 2);
    if (byName) return { categoryId: byName.id, confidence: "medium" };
  }

  if (input.domain) {
    const hint = DOMAIN_CATEGORY_HINTS.find((h) => h.pattern.test(input.domain!.toLowerCase()));
    if (hint) {
      const match = categories.find((c) => c.name.toLowerCase() === hint.categoryName.toLowerCase());
      if (match) return { categoryId: match.id, confidence: "low" };
    }
  }

  return null;
}
