import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { getLibraryHealth } from "@/lib/data/library-health";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const health = await getLibraryHealth(supabase, user.id);
    return NextResponse.json({ health });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load library health." }, { status: 500 });
  }
}
