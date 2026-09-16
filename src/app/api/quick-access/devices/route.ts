import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";

// Quick Access (Part I/J) bookkeeping — see the trusted_devices table's
// own migration comment for why this carries no authentication power on
// its own. GET lists the signed-in user's own devices (RLS-scoped —
// requireUser's cookie-session client, not service-role); POST
// registers/touches "this device" (upsert on the (user_id, device_id)
// unique index, so revisiting just bumps last_seen_at rather than
// creating duplicates).
export async function GET() {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const { data, error } = await supabase
    .from("trusted_devices")
    .select("id, device_id, label, created_at, last_seen_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devices: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user, unauthorized } = await requireUser();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.slice(0, 100) : null;
  const label = typeof body?.label === "string" ? body.label.slice(0, 80) : null;
  if (!deviceId) return NextResponse.json({ error: "deviceId is required." }, { status: 400 });

  const { error } = await supabase
    .from("trusted_devices")
    .upsert(
      { user_id: user.id, device_id: deviceId, label, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,device_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
