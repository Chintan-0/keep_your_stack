import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { fetchMetadata } from "@/lib/data/metadata";

// Server-only metadata extraction. Kept behind auth so this can't be used
// as an anonymous open URL-fetching proxy.
export async function POST(request: NextRequest) {
  const { unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body?.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const result = await fetchMetadata(body.url);
  return NextResponse.json(result);
}
