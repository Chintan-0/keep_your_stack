import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { mergeResources } from "@/lib/data/library-health";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body?.keeperId || !body?.loserId) {
    return NextResponse.json({ error: "keeperId and loserId are required." }, { status: 400 });
  }

  try {
    const resource = await mergeResources(supabase, user.id, body.keeperId, body.loserId);
    return NextResponse.json({ resource });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't merge these resources." }, { status: 400 });
  }
}
