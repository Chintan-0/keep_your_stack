import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { validateUsername } from "@/lib/username-validation";

// Read-only bits the client needs but the (app) layout's own server-side
// fetch doesn't pass down (it only reads name/email for the top bar) — the
// onboarding checklist (Phase 17) needs to know if this profile already
// dismissed it, without a second full page fetch.
export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_dismissed_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ onboardingDismissedAt: data?.onboarding_dismissed_at ?? null });
}

export async function PATCH(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
  }

  const patch: { name?: string; username?: string; onboarding_dismissed_at?: string } = {};
  if (name !== undefined) patch.name = name;
  // Only ever set to "now" — there's no product need to un-dismiss it, and
  // allowing an arbitrary client-supplied timestamp here would be pointless
  // surface area for no benefit.
  if (body?.dismissOnboarding === true) patch.onboarding_dismissed_at = new Date().toISOString();

  if (typeof body?.username === "string") {
    const result = validateUsername(body.username);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    patch.username = result.username;
  }

  const { error } = await supabase.from("profiles").update(patch).eq("id", user.id);
  if (error) {
    // 23505 = unique_violation on the case-insensitive username index —
    // the one error worth a specific, honest message rather than the
    // generic fallback (a raw Postgres constraint name isn't useful to a
    // user picking a handle).
    if (error.code === "23505") {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
