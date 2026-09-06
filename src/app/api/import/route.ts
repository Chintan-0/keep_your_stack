import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { createResource } from "@/lib/data/resources";

interface ImportBookmark {
  title: string;
  url: string;
}

// Imports a batch of parsed bookmarks. Each entry is saved independently
// so one bad/duplicate URL can't sink the whole import — we report per-item
// outcomes instead.
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

  let imported = 0;
  let duplicates = 0;
  const failed: { url: string; reason: string }[] = [];

  for (const bookmark of bookmarks) {
    if (!bookmark?.url) continue;
    try {
      const { duplicate } = await createResource(supabase, user.id, {
        url: bookmark.url,
        title: bookmark.title,
      });
      if (duplicate) duplicates++;
      else imported++;
    } catch (e) {
      failed.push({ url: bookmark.url, reason: e instanceof Error ? e.message : "Unknown error" });
    }
  }

  return NextResponse.json({ imported, duplicates, failed });
}
