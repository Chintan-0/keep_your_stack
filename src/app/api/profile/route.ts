import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { validateUsername } from "@/lib/username-validation";

export async function PATCH(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  if (name !== undefined && name.length === 0) {
    return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
  }

  const patch: { name?: string; username?: string } = {};
  if (name !== undefined) patch.name = name;

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
