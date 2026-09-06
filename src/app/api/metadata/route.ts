import { NextRequest, NextResponse } from "next/server";
import { fetchMetadata } from "@/lib/data/metadata";

// Server-only metadata extraction — has to run server-side (arbitrary
// cross-origin fetches aren't possible from the browser), but doesn't
// require auth since there's no per-user data involved, just reading a
// public page's <head>. SSRF guards live in fetchMetadata itself.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const result = await fetchMetadata(body.url);
  return NextResponse.json(result);
}
