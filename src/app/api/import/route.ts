import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { createResource } from "@/lib/data/resources";
import { trackEvent } from "@/lib/data/analytics";
import type { Resource } from "@/lib/types";

interface ImportBookmark {
  title: string;
  url: string;
  folder?: string | null;
  categoryId?: string | null;
  stackIds?: string[];
  tagNames?: string[];
  description?: string;
  notes?: string;
  useCases?: string[];
  /** Per-item override of the batch's `source` — used when a single chunk mixes sources (not currently done by the import page, but kept honest rather than assumed). */
  source?: string;
  /** The source's own ID for this item, when one exists (a JSON backup's resource id) — provenance only. */
  sourceId?: string;
  /** Only ever honored when the *source actually provided one* (an HTML bookmark's ADD_DATE, or a JSON backup's own timestamp) — never fabricated by the importer itself. */
  createdAt?: string;
  /** Restoring a user's own prior state (JSON backup) — never set by the HTML/CSV import UI, which has no such concept for a freshly-discovered bookmark. */
  isFavorite?: boolean;
  isArchived?: boolean;
}

const MAX_ITEMS_PER_REQUEST = 1000;

// Imports a batch of normalized items from any import source (Chrome/
// Firefox/Edge/generic Netscape HTML, CSV — see src/lib/import/). Each
// entry is saved independently — URL + title only, no metadata fetch
// here — so one bad/duplicate/slow URL can't sink the whole import or
// block on network calls to other sites. Metadata enrichment happens
// afterward, client-side, in small batches (see the import page):
// "import first, enrich later," never the other way around. A JSON
// backup restore uses the separate /api/import/backup route instead,
// since it needs to resolve category/stack/tag names rather than accept
// a single flat folder string.
export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const bookmarks: ImportBookmark[] = Array.isArray(body?.bookmarks) ? body.bookmarks : [];
  const batchSource = typeof body?.source === "string" && body.source.trim() ? body.source.trim() : "chrome-bookmarks";
  if (bookmarks.length === 0) {
    return NextResponse.json({ error: "No bookmarks provided" }, { status: 400 });
  }
  if (bookmarks.length > MAX_ITEMS_PER_REQUEST) {
    return NextResponse.json({ error: `Import is limited to ${MAX_ITEMS_PER_REQUEST} bookmarks at a time.` }, { status: 400 });
  }

  // Large imports are chunked into several of these calls (see the import
  // page) — this fires once per chunk rather than once per whole import
  // (there's no "whole import" concept this route itself can see), but
  // that's still a real, honest signal of import activity happening,
  // consistent with "import_completed"/"import_failed" which the separate
  // /api/import/history route records once the client-side batch finishes.
  void trackEvent({ eventType: "import_started", userId: user.id, metadata: { source: batchSource, total: bookmarks.length } });

  let duplicates = 0;
  const failed: { url: string; title: string; reason: string }[] = [];
  const created: Resource[] = [];

  for (const bookmark of bookmarks) {
    if (!bookmark?.url) continue;
    try {
      // A malformed date (unparseable, or literally the string "Invalid
      // Date") must never reach the database — fall back to leaving it
      // unset (createResource then uses the column's own now() default)
      // rather than rejecting the whole item over a cosmetic timestamp.
      const createdAt =
        bookmark.createdAt && !Number.isNaN(new Date(bookmark.createdAt).getTime())
          ? new Date(bookmark.createdAt).toISOString()
          : undefined;

      const { resource, duplicate } = await createResource(supabase, user.id, {
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
        notes: bookmark.notes,
        useCases: bookmark.useCases,
        categoryId: bookmark.categoryId ?? null,
        stackIds: Array.isArray(bookmark.stackIds) ? bookmark.stackIds : [],
        tagNames: Array.isArray(bookmark.tagNames) ? bookmark.tagNames : [],
        importSource: bookmark.source ?? batchSource,
        importFolder: bookmark.folder ?? null,
        importSourceId: bookmark.sourceId ?? null,
        createdAt,
        isFavorite: bookmark.isFavorite,
        isArchived: bookmark.isArchived,
      });
      if (duplicate) duplicates++;
      else created.push(resource);
    } catch (e) {
      failed.push({
        url: bookmark.url,
        title: bookmark.title || bookmark.url,
        reason: e instanceof Error ? e.message : "Couldn't save this resource.",
      });
    }
  }

  return NextResponse.json({ imported: created.length, duplicates, failed, created });
}
