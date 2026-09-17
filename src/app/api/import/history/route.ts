import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listImportHistory, recordImport } from "@/lib/data/import-history";
import { trackEvent, trackIfFirst } from "@/lib/data/analytics";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;
  try {
    const history = await listImportHistory(supabase, user.id);
    return NextResponse.json({ history });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load import history." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.source !== "string" || typeof body.total !== "number") {
    return NextResponse.json({ error: "Invalid import history entry." }, { status: 400 });
  }

  try {
    const entry = await recordImport(supabase, user.id, {
      source: body.source,
      filename: typeof body.filename === "string" ? body.filename : null,
      total: body.total,
      imported: Number(body.imported) || 0,
      skipped: Number(body.skipped) || 0,
      failed: Number(body.failed) || 0,
      failedItems: Array.isArray(body.failedItems) ? body.failedItems : [],
    });
    // Recorded once per completed import (this route is called exactly
    // once at the end, with final totals) — "started" isn't separately
    // trackable from here since the import itself runs as several chunked
    // /api/import calls before this summary lands; imported=0 with
    // failed>0 is treated as a failed import, not a completed one.
    const succeeded = entry.imported > 0 || entry.failed === 0;
    void trackEvent({
      eventType: succeeded ? "import_completed" : "import_failed",
      userId: user.id,
      metadata: { source: entry.source, total: entry.total, imported: entry.imported, failed: entry.failed },
    });
    if (succeeded) {
      const { count } = await supabase.from("import_history").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (typeof count === "number") trackIfFirst("first_import_completed", user.id, count);
    }
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't record this import." }, { status: 500 });
  }
}
