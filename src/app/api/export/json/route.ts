import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { buildBackup, type ExportScope } from "@/lib/data/export";

function parseScope(params: URLSearchParams): ExportScope {
  const scope = params.get("scope");
  if (scope === "selected") {
    const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
    return { type: "selected", ids };
  }
  if (scope === "favorites") return { type: "favorites" };
  if (scope === "stack") return { type: "stack", stackId: params.get("stackId") ?? "" };
  if (scope === "category") return { type: "category", categoryId: params.get("categoryId") ?? "" };
  return { type: "all" };
}

/** The full KeepYourStack backup — see src/lib/import/backup.ts. Never includes auth tokens/sessions/secrets: none exist on these tables in the first place. */
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  try {
    const backup = await buildBackup(supabase, user.id, parseScope(request.nextUrl.searchParams));
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="keepyourstack-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build your export." }, { status: 500 });
  }
}
