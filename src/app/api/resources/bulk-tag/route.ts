import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { bulkAddTags } from "@/lib/data/resources";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.resourceIds) || body.resourceIds.length === 0 || !Array.isArray(body.tagNames)) {
    return NextResponse.json({ error: "resourceIds and tagNames are required." }, { status: 400 });
  }

  try {
    const count = await bulkAddTags(
      supabase,
      user.id,
      body.resourceIds.filter((id: unknown) => typeof id === "string"),
      body.tagNames.filter((t: unknown) => typeof t === "string")
    );
    return NextResponse.json({ count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't add those tags." }, { status: 400 });
  }
}
