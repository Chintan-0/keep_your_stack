import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";

// Revokes one trusted-device record — RLS ("trusted_devices: delete own")
// is the real enforcement here (the .eq("user_id", user.id) below is
// defense in depth on top of it, same pattern as every other owner-scoped
// route). This only removes the bookkeeping row; it does not by itself
// end that device's Supabase session (that's what "sign out other
// devices" — a direct client-side supabase.auth.signOut({scope:"others"})
// call — actually does, since only Supabase's own session store can
// revoke a refresh token).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { error } = await supabase.from("trusted_devices").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
