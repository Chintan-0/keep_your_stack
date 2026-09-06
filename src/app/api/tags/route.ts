import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listTags } from "@/lib/data/tags";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const tags = await listTags(supabase, user.id);
    return NextResponse.json({ tags });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to load tags" }, { status: 500 });
  }
}
