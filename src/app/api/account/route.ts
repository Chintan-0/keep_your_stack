import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/data/auth";
import type { Database } from "@/lib/supabase/types";
import { corsPreflight, withCors } from "@/lib/cors";

// "Who am I" check — used by the Chrome extension to decide whether it's
// Connected / Not connected / Session expired (see extension/src/popup).
// Accepts either the web app's cookie session or the extension's Bearer
// token (see requireUser).
export async function GET(request: NextRequest) {
  const { user, unauthorized } = await requireUser(request);
  if (unauthorized) return withCors(request, unauthorized);
  return withCors(request, NextResponse.json({ user: { id: user.id, email: user.email ?? null } }));
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}

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
