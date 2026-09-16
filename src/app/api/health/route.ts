import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Minimal production health check — no auth required (a load balancer or
 * uptime monitor can't log in), no sensitive information in the response
 * either way. Runs one cheap, RLS-safe query (a head-only count against a
 * table anyone can query the *shape* of, just never see rows of without
 * auth) to confirm the app can actually reach Postgres through PostgREST,
 * not just that the Next.js process is alive.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("categories").select("id", { head: true, count: "exact" });
    if (error) throw new Error(error.message);
    return NextResponse.json(
      { status: "ok", latencyMs: Date.now() - startedAt },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // Never leak the underlying error message (could contain connection
    // strings, hostnames, or other internal detail) — the boolean
    // status/503 is the whole signal a monitor needs.
    return NextResponse.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
