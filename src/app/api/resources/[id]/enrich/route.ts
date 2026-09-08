import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { enrichResource } from "@/lib/data/enrichment";
import { corsPreflight, withCors } from "@/lib/cors";

// Runs the deterministic enrichment pipeline (src/lib/enrichment.ts +
// src/lib/data/enrichment.ts) for one resource: fetches page metadata and
// fills in description/Useful For/tags/category from real evidence only,
// never overwriting anything the user already set themselves. Used by:
// the import page's Phase B pass, the Chrome extension (save now, enrich
// right after — see extension/src/lib/api.ts), bulk "Enrich selected" on
// All Resources, and the single "Retry enrichment" button on Resource
// Detail. Same endpoint, same rules, everywhere — no separate logic path.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);

  try {
    const result = await enrichResource(supabase, user.id, id);
    return withCors(request, NextResponse.json(result));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't enrich this resource." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
