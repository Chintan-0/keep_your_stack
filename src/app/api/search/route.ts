import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { searchResources } from "@/lib/data/search";

export async function GET(request: NextRequest) {
  const { supabase, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const q = request.nextUrl.searchParams.get("q") ?? "";
  try {
    const results = await searchResources(supabase, q);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable." }, { status: 503 });
  }
}
