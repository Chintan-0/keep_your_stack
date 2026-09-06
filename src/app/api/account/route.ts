import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/data/auth";
import type { Database } from "@/lib/supabase/types";

// Deleting a user requires Supabase's admin API, which only the
// service-role key can call — that key never reaches the browser. We still
// authenticate the request normally first and only ever delete the caller's
// own id, never one supplied by the client.
export async function DELETE() {
  const { user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Account deletion isn't configured on this server." }, { status: 501 });
  }

  const admin = createServiceClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
