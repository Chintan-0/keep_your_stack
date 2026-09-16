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
const ALLOWED: ReadonlySet<EventType> = new Set([
  "signup",
  "login",
  "logout",
  "public_resource_opened",
  "public_resource_saved",
  "stack_shared",
]);

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

  // Small, bounded metadata only — a resource/stack id to give the event
  // context, never free-text or resource content. Truncated defensively
  // regardless, since this is client-supplied.
  const rawMetadata = body?.metadata;
  const metadata: Record<string, unknown> = {};
  if (rawMetadata && typeof rawMetadata === "object") {
    for (const key of ["stackId", "resourceId"]) {
      const value = (rawMetadata as Record<string, unknown>)[key];
      if (typeof value === "string") metadata[key] = value.slice(0, 100);
    }
  }

  void trackEvent({ eventType: eventType as EventType, userId, metadata });
  return NextResponse.json({ ok: true });
}
