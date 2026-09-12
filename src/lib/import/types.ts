// The normalized shape every import source (Chrome/Firefox/Edge/generic
// Netscape HTML, CSV, a KeepYourStack JSON backup) is converted into
// before it ever reaches the shared preview/mapping/save pipeline — see
// src/app/(app)/import/page.tsx. No source-specific field or parsing
// quirk leaks past its own adapter; nothing downstream needs to know
// which format a given item came from except via `source`.
export interface ImportItem {
  title: string;
  url: string;
  description?: string;
  /** Comma/semicolon-free, already-split tag names — normalization (trim/lowercase/dedupe) happens server-side in ensureTags(), same as every other tag entry point. */
  tags?: string[];
  /** Original folder path, e.g. "Development / Frontend" — the one thing the mapping UI groups by. Absent for CSV rows with no category column and no folder concept. */
  folderPath?: string | null;
  notes?: string;
  useCases?: string[];
  /** ISO date string, only when the source actually provided one — never fabricated. */
  createdAt?: string | null;
  isFavorite?: boolean;
  isArchived?: boolean;
  /** e.g. "chrome", "firefox", "edge", "csv", "keepyourstack-backup". */
  source: string;
  /** The source's own ID for this item, when one exists (a backup's resource id). */
  sourceId?: string | null;
}

export const MAX_IMPORT_ITEMS = 20000;
export const MAX_TITLE_LENGTH = 500;
export const MAX_DESCRIPTION_LENGTH = 5000;
export const MAX_NOTES_LENGTH = 20000;
export const MAX_TAGS_PER_ITEM = 30;

/** Applied uniformly to every ImportItem regardless of source, right before it's shown in a preview — pathological input (a 4MB "title") is truncated, not silently accepted or fatal. */
export function clampImportItem(item: ImportItem): ImportItem {
  return {
    ...item,
    title: item.title.slice(0, MAX_TITLE_LENGTH),
    description: item.description?.slice(0, MAX_DESCRIPTION_LENGTH),
    notes: item.notes?.slice(0, MAX_NOTES_LENGTH),
    tags: item.tags?.slice(0, MAX_TAGS_PER_ITEM),
  };
}
