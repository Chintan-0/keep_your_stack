import { NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";

// Wipes everything the signed-in user has saved — all their resources,
// stacks, and tags — but leaves the account itself intact (unlike
// /api/account's delete-account, which also removes the login). This is
// the "start over" button for testing/demo cleanup, explicit and
// confirmed client-side before this ever gets called.
export async function DELETE() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  // resource_tags/resource_stacks cascade off these deletes (see
  // supabase/migrations) — nothing orphaned is left behind.
  const { error: resourcesError } = await supabase.from("resources").delete().eq("user_id", user.id);
  if (resourcesError) return NextResponse.json({ error: resourcesError.message }, { status: 500 });

  const { error: stacksError } = await supabase.from("stacks").delete().eq("user_id", user.id);
  if (stacksError) return NextResponse.json({ error: stacksError.message }, { status: 500 });

  const { error: tagsError } = await supabase.from("tags").delete().eq("user_id", user.id);
  if (tagsError) return NextResponse.json({ error: tagsError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
