import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackEvent, type EventType } from "@/lib/data/analytics";

// A small, explicit allowlist — this route only ever records one of these
// exact product events, never an arbitrary caller-supplied string. Used
// for the handful of events that only make sense to fire from client
// components (signup/login, right after the Supabase auth call succeeds —
// there's no server-side hook for "a browser just completed sign-in").
// Cookie-session only (this is web-app UI only, never called by the
// extension) — always best-effort, always responds {ok:true}.
const ALLOWED: ReadonlySet<EventType> = new Set(["signup", "login", "logout"]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventType = body?.eventType;
  if (typeof eventType !== "string" || !ALLOWED.has(eventType as EventType)) {
    return NextResponse.json({ ok: true }); // silently ignore anything outside the allowlist
  }

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Fine — some of these (signup) fire right as the session is being established.
  }

  void trackEvent({ eventType: eventType as EventType, userId });
  return NextResponse.json({ ok: true });
}
