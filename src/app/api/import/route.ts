import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { createResource } from "@/lib/data/resources";
import type { Resource } from "@/lib/types";

interface ImportBookmark {
  title: string;
  url: string;
  folder?: string | null;
  categoryId?: string | null;
  stackIds?: string[];
}

// Imports a batch of parsed bookmarks. Each entry is saved independently —
// URL + title only, no metadata fetch here — so one bad/duplicate/slow URL
// can't sink the whole import or block on network calls to other sites.
// Metadata enrichment happens afterward, client-side, in small batches
// (see the import page): "import first, enrich later," never the other
// way around.
export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const bookmarks: ImportBookmark[] = Array.isArray(body?.bookmarks) ? body.bookmarks : [];
  if (bookmarks.length === 0) {
    return NextResponse.json({ error: "No bookmarks provided" }, { status: 400 });
  }
  if (bookmarks.length > 1000) {
    return NextResponse.json({ error: "Import is limited to 1000 bookmarks at a time." }, { status: 400 });
  }

  let duplicates = 0;
  const failed: { url: string; reason: string }[] = [];
  const created: Resource[] = [];

  for (const bookmark of bookmarks) {
    if (!bookmark?.url) continue;
    try {
      const { resource, duplicate } = await createResource(supabase, user.id, {
        url: bookmark.url,
        title: bookmark.title,
        categoryId: bookmark.categoryId ?? null,
        stackIds: Array.isArray(bookmark.stackIds) ? bookmark.stackIds : [],
        importSource: "chrome-bookmarks",
        importFolder: bookmark.folder ?? null,
      });
      if (duplicate) duplicates++;
      else created.push(resource);
    } catch (e) {
      failed.push({ url: bookmark.url, reason: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ imported: created.length, duplicates, failed, created });
}
