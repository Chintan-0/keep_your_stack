import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getResourceStats } from "@/lib/data/resources";
import { corsPreflight, withCors } from "@/lib/cors";

// Three cheap indexed counts (total / favorites / added-recently) instead
// of downloading the whole library just to show three numbers on the
// dashboard — see getResourceStats' own comment for why.
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    const stats = await getResourceStats(supabase, user.id);
    return withCors(request, NextResponse.json({ stats }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load stats" }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
