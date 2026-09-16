import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/data/auth";
import { corsPreflight, withCors } from "@/lib/cors";
import { trackEvent, type EventType } from "@/lib/data/analytics";

// A small, explicit allowlist — this route only ever records one of these
// exact product events, never an arbitrary caller-supplied string. Used
// for events that only make sense to fire from a client (signup/login,
// right after the Supabase auth call succeeds — there's no server-side
// hook for "a browser just completed sign-in"; extension_* events, fired
// by the Chrome extension's popup/background — see extension/src/lib/
// analytics.ts) — always best-effort, always responds {ok:true}.
const ALLOWED: ReadonlySet<EventType> = new Set([
  "signup",
  "login",
  "logout",
  "public_resource_opened",
  "public_resource_saved",
  "stack_shared",
  "bookmark_import_started",
  "bookmark_import_completed",
  "bookmark_import_failed",
  "bookmark_import_previewed",
  "bookmark_duplicate_detected",
  "stack_studio_opened",
  "auto_organize_started",
  "auto_organize_completed",
  "resource_organization_changed",
  "bulk_organization_completed",
  "review_started",
  "review_completed",
  "extension_popup_opened",
  "extension_metadata_loaded",
  "extension_suggestion_shown",
  "extension_suggestion_changed",
  "extension_save_started",
  "extension_save_success",
  "extension_save_failure",
  "extension_duplicate_detected",
  "extension_login_required",
]);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const eventType = body?.eventType;
  if (typeof eventType !== "string" || !ALLOWED.has(eventType as EventType)) {
    return withCors(request, NextResponse.json({ ok: true })); // silently ignore anything outside the allowlist
  }

  // requireUser accepts either a cookie session (web app) or an
  // Authorization: Bearer token (the extension) — see src/lib/data/auth.ts.
  // extension_login_required must still be recorded even with no session
  // at all, so a missing/invalid credential here never blocks recording —
  // it just leaves userId null instead of attributing the event.
  let userId: string | null = null;
  try {
    const { user, unauthorized } = await requireUser(request);
    if (!unauthorized) userId = user.id;
  } catch {
    // Fine — some of these (signup) fire right as the session is being established.
  }

  // Small, bounded metadata only — a resource/stack id and a handful of
  // counts to give the event context, never free-text, page contents, or
  // resource content. Truncated defensively regardless, since this is
  // client-supplied.
  const rawMetadata = body?.metadata;
  const metadata: Record<string, unknown> = {};
  if (rawMetadata && typeof rawMetadata === "object") {
    for (const key of ["stackId", "resourceId"]) {
      const value = (rawMetadata as Record<string, unknown>)[key];
      if (typeof value === "string") metadata[key] = value.slice(0, 100);
    }
    for (const key of ["count", "total", "imported", "duplicates", "failed", "needsReview"]) {
      const value = (rawMetadata as Record<string, unknown>)[key];
      if (typeof value === "number" && Number.isFinite(value)) metadata[key] = value;
    }
  }

  void trackEvent({ eventType: eventType as EventType, userId, metadata });
  return withCors(request, NextResponse.json({ ok: true }));
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
