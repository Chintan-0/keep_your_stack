import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { buildExportCsv, type ExportScope } from "@/lib/data/export";
import { trackEvent } from "@/lib/data/analytics";

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

/** Spreadsheet-safe (formula-injection escaped — see src/lib/import/csv.ts's sanitizeCsvCell). */
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  try {
    const csv = await buildExportCsv(supabase, user.id, parseScope(request.nextUrl.searchParams));
    void trackEvent({ eventType: "export_performed", userId: user.id, metadata: { format: "csv" } });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="keepyourstack-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't build your export." }, { status: 500 });
  }
}
