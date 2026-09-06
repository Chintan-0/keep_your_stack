import type { Category, Stack } from "./types";
import type { ParsedBookmark } from "./bookmark-import";

// Chrome/Firefox/Edge always wrap every bookmark in one of these top-level
// containers — they're not meaningful organization, just where the browser
// put things, so they're never worth suggesting as a category or stack.
const GENERIC_ROOT_FOLDERS = new Set([
  "bookmarks bar",
  "other bookmarks",
  "mobile bookmarks",
  "bookmarks menu",
  "bookmarks toolbar",
]);

/** The last, most specific segment of a folder path — the best stack-name candidate. */
export function leafFolderName(folder: string | null): string | null {
  if (!folder) return null;
  const segments = folder.split(" / ").map((s) => s.trim());
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i] && !GENERIC_ROOT_FOLDERS.has(segments[i].toLowerCase())) {
      return segments[i];
    }
  }
  return null;
}

export interface StackSuggestion {
  /** An existing stack this folder likely matches — reuse it. */
  existingStackId: string | null;
  /** If no existing stack matches, the name a new one could use. */
  suggestedName: string | null;
}

/** Case-insensitive exact match against the user's current stacks, else propose the leaf folder name as a new one. */
export function suggestStackForFolder(folder: string | null, stacks: Stack[]): StackSuggestion {
  const leaf = leafFolderName(folder);
  if (!leaf) return { existingStackId: null, suggestedName: null };
  const existing = stacks.find((s) => s.name.toLowerCase() === leaf.toLowerCase());
  return existing ? { existingStackId: existing.id, suggestedName: null } : { existingStackId: null, suggestedName: leaf };
}

/**
 * Matches folder segments against the real category tree by name (e.g. a
 * "Development/Frontend" folder against the "Frontend" category under
 * "Development"), preferring the most specific (deepest) match. Never
 * invents a category that doesn't already exist — this only ever reuses
 * the real taxonomy.
 */
export function suggestCategoryForFolder(folder: string | null, categories: Category[]): string | null {
  if (!folder) return null;
  const segments = folder
    .split(" / ")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => !GENERIC_ROOT_FOLDERS.has(s));

  // Check from the most specific (last) segment back to the least.
  for (let i = segments.length - 1; i >= 0; i--) {
    const match = categories.find((c) => c.name.toLowerCase() === segments[i]);
    if (match) return match.id;
  }
  return null;
}

export interface FolderGroup {
  /** Full original folder path, or null for bookmarks with no folder. */
  folder: string | null;
  bookmarks: ParsedBookmark[];
}

/** Groups parsed bookmarks by their original folder path, preserving first-seen order. */
export function groupByFolder(bookmarks: ParsedBookmark[]): FolderGroup[] {
  const order: (string | null)[] = [];
  const map = new Map<string | null, ParsedBookmark[]>();
  for (const b of bookmarks) {
    if (!map.has(b.folder)) {
      map.set(b.folder, []);
      order.push(b.folder);
    }
    map.get(b.folder)!.push(b);
  }
  return order.map((folder) => ({ folder, bookmarks: map.get(folder)! }));
}
