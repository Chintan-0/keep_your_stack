import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getDuplicateGroups } from "@/lib/data/library-health";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const groups = await getDuplicateGroups(supabase, user.id);
    return NextResponse.json({ groups });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load duplicates." }, { status: 500 });
  }
}
