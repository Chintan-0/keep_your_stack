import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { corsPreflight, withCors } from "@/lib/cors";

// Just the normalized_url column, not full resource rows — Stack Studio's
// import preview (Part C/V: "do not fetch the entire user's existing
// library... during duplicate detection") needs to know which imported
// URLs already exist to show an accurate new/duplicate count before
// importing anything, without pulling titles/descriptions/notes for a
// library that could be thousands of resources. One indexed column,
// fetched once per Stack Studio session, not per bookmark.
export async function GET(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  try {
    const { data, error } = await supabase.from("resources").select("normalized_url").eq("user_id", user.id).limit(50000);
    if (error) throw new Error(error.message);
    return withCors(request, NextResponse.json({ urls: (data ?? []).map((r) => r.normalized_url) }));
  } catch (e) {
    return withCors(
      request,
      NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load your existing URLs." }, { status: 500 })
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
