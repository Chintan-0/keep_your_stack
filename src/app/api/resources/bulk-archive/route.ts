import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { bulkSetArchived } from "@/lib/data/resources";

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.resourceIds) || body.resourceIds.length === 0) {
    return NextResponse.json({ error: "Select at least one resource." }, { status: 400 });
  }

  try {
    const count = await bulkSetArchived(
      supabase,
      user.id,
      body.resourceIds.filter((id: unknown) => typeof id === "string"),
      body.archived !== false
    );
    return NextResponse.json({ count });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't update those resources." }, { status: 400 });
  }
}
