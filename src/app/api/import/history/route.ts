import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listImportHistory, recordImport } from "@/lib/data/import-history";

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
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't record this import." }, { status: 500 });
  }
}
