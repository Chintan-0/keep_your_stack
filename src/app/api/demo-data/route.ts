import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { loadDemoData } from "@/lib/data/demo-data";

// Explicit, user-triggered only (see Settings > Data > Load Demo Data /
// the sign-up flow's optional prompt) — never runs automatically, so a
// real account only ever gets fake resources if the person asks for them.
export async function POST() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const result = await loadDemoData(supabase, user.id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't load demo data." },
      { status: 500 }
    );
  }
}
