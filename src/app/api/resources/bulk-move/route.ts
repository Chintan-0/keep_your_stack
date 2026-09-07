import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { bulkMoveResources } from "@/lib/data/resources";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.resourceIds) || body.resourceIds.length === 0) {
    return NextResponse.json({ error: "Select at least one resource to move." }, { status: 400 });
  }

  try {
    const moved = await bulkMoveResources(
      supabase,
      user.id,
      body.resourceIds.filter((id: unknown) => typeof id === "string"),
      body.categoryId ?? null
    );
    return NextResponse.json({ moved });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't move those resources." }, { status: 400 });
  }
}
