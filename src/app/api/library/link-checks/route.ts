import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { listLinkChecks } from "@/lib/data/link-check";

export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  try {
    const map = await listLinkChecks(supabase, user.id);
    // Plain objects over the wire — Maps don't survive JSON.
    const linkChecks = Object.fromEntries(map);
    return NextResponse.json({ linkChecks });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load link health." }, { status: 500 });
  }
}
