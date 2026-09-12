import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { resolveBackupTaxonomy } from "@/lib/data/import-backup";
import { validateBackup, MAX_BACKUP_FILE_BYTES } from "@/lib/import/backup";

// Phase 1 of a JSON backup restore: resolves the backup's own categories
// and stacks against the importing user's real, current taxonomy (never
// trusting the backup's own ids — see resolveBackupTaxonomy's own doc
// comment), creating whatever doesn't already exist by name. The client
// then substitutes these real ids into each resource before sending
// chunks to the existing, shared /api/import route — so a JSON restore
// creates resources through exactly the same code path an HTML or CSV
// import does; nothing about resource creation itself is duplicated.
export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const raw = await request.text();
  if (raw.length > MAX_BACKUP_FILE_BYTES) {
    return NextResponse.json({ error: "That backup file is too large." }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "That file isn't valid JSON." }, { status: 400 });
  }

  const result = validateBackup(parsed);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  try {
    const { categoryIdMap, stackIdMap } = await resolveBackupTaxonomy(supabase, user.id, {
      categories: result.backup.categories,
      stacks: result.backup.stacks,
    });
    return NextResponse.json({
      categoryIdMap,
      stackIdMap,
      resources: result.backup.resources,
      tags: result.backup.tags,
      warnings: result.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't prepare this backup for import." },
      { status: 500 }
    );
  }
}
