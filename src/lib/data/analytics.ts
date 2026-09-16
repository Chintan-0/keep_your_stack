import "server-only";
import { createClient as createServiceUrlClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

/**
 * KeepYourStack first-party analytics — what's collected and why.
 *
 * Two tables (supabase/migrations/20260101000010_admin_analytics.sql):
 *  - analytics_events: one row per tracked event (a page view, or a
 *    product action like "resource created"). Columns: event_type,
 *    user_id (nullable — null for anonymous/visitor events),
 *    anonymous_visitor_id (nullable), session_id (nullable), path,
 *    referrer, a small metadata jsonb blob, created_at.
 *  - visitor_sessions: one row per anonymous browsing session (see
 *    SESSION_TIMEOUT_MS below), upserted as page views come in.
 *
 * What is NEVER stored, anywhere in this file: raw IP addresses, full
 * request headers, passwords/tokens/secrets, resource titles/URLs/notes/
 * descriptions, or anything from a request body beyond the specific
 * documented fields below. `country` comes from Vercel's own
 * `x-vercel-ip-country` header (a coarse country code Vercel derives and
 * attaches itself) when present — no IP is ever read or stored to get it,
 * and it's simply absent outside Vercel (local dev).
 *
 * The anonymous visitor id is a random UUID minted client-side
 * (crypto.randomUUID()) and kept in localStorage — never derived from IP
 * or any other identifying signal — so it identifies a browser, not a
 * person, and resets if the user clears site data.
 *
 * Definitions used throughout the admin dashboard:
 *  - Page view: one tracked navigation to a real app route. Static assets,
 *    _next/*, and API routes never go through the tracker — see
 *    src/components/analytics-tracker.tsx, which only fires on real route
 *    changes in the app shell.
 *  - Session: page views from the same anonymous_visitor_id are grouped
 *    into one session as long as consecutive views are within
 *    SESSION_TIMEOUT_MS of each other; a gap longer than that starts a new
 *    session (a new session_id, a new visitor_sessions row).
 *  - Visitor (in a reporting period): a distinct anonymous_visitor_id with
 *    at least one session whose first_seen_at falls in that period.
 *  - Returning visitor: a visitor_sessions row whose anonymous_visitor_id
 *    already had an earlier session (visitor_sessions.is_returning, set
 *    at insert time by checking for a prior row with the same id).
 *  - Active user (signed-in): a distinct user_id with at least one
 *    analytics_events row in the period — any tracked product action,
 *    not just a page view.
 *
 * Every write in this file is best-effort: wrapped so a failure here can
 * never throw into (and break) the real product action that triggered it
 * — see the try/catch in trackEvent and trackPageView.
 */

type ServiceClient = ReturnType<typeof createServiceUrlClient<Database>>;
let cachedClient: ServiceClient | null = null;

function serviceClient(): ServiceClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null; // analytics is best-effort — missing config just means no tracking, not a crash
  cachedClient = createServiceUrlClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cachedClient;
}

export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of inactivity starts a new session

export type EventType =
  // auth
  | "signup"
  | "login"
  | "logout"
  // resources
  | "resource_created"
  | "resource_updated"
  | "resource_deleted"
  | "resource_favorited"
  | "resource_unfavorited"
  | "resource_archived"
  | "resource_restored"
  | "duplicate_save_prevented"
  // enrichment
  | "enrichment_requested"
  | "enrichment_completed"
  | "enrichment_failed"
  // search
  | "search_performed"
  // import/export
  | "import_started"
  | "import_completed"
  | "import_failed"
  | "export_performed"
  // extension
  | "extension_save_success"
  | "extension_save_failure"
  // visitor analytics
  | "page_view"
  // Phase 13: shareable stacks
  | "public_profile_view"
  | "public_stack_view"
  | "stack_shared"
  | "stack_visibility_changed"
  | "stack_clone_started"
  | "stack_clone_completed"
  | "stack_clone_failed"
  | "public_resource_opened"
  | "public_resource_saved";

export interface TrackEventInput {
  eventType: EventType;
  userId?: string | null;
  anonymousVisitorId?: string | null;
  sessionId?: string | null;
  path?: string | null;
  referrer?: string | null;
  /** Kept small and non-sensitive — see this file's header comment. */
  metadata?: Record<string, unknown>;
}

/** Fire-and-forget: logs and swallows any failure rather than throwing. Call with `void trackEvent(...)`, never `await` where it could block a response. */
export async function trackEvent(input: TrackEventInput): Promise<void> {
  const client = serviceClient();
  if (!client) return;
  try {
    await client.from("analytics_events").insert({
      event_type: input.eventType,
      user_id: input.userId ?? null,
      anonymous_visitor_id: input.anonymousVisitorId ?? null,
      session_id: input.sessionId ?? null,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      metadata: input.metadata ?? {},
    });
  } catch {
    // Best-effort — analytics must never break the real action that triggered it.
  }
}

// ── device/browser/OS classification ────────────────────────────────────
// A small, dependency-free classifier (no ua-parser-js) — coarse
// categories only ("mobile"/"desktop"/"tablet", a handful of major
// browsers/OSes), which is all the dashboard needs. Not exhaustive by
// design.
export function classifyUserAgent(ua: string | null): { deviceType: string; browser: string; os: string } {
  const s = (ua ?? "").toLowerCase();
  const deviceType = /ipad|tablet/.test(s) ? "tablet" : /mobile|iphone|android/.test(s) ? "mobile" : "desktop";
  const browser = /edg\//.test(s)
    ? "Edge"
    : /chrome\//.test(s)
      ? "Chrome"
      : /firefox\//.test(s)
        ? "Firefox"
        : /safari\//.test(s) && !/chrome/.test(s)
          ? "Safari"
          : "Other";
  const os = /windows/.test(s)
    ? "Windows"
    : /mac os x|macintosh/.test(s)
      ? "macOS"
      : /android/.test(s)
        ? "Android"
        : /iphone|ipad|ios/.test(s)
          ? "iOS"
          : /linux/.test(s)
            ? "Linux"
            : "Other";
  return { deviceType, browser, os };
}

export interface PageViewInput {
  anonymousVisitorId: string;
  sessionId: string;
  path: string;
  referrer: string | null;
  userAgent: string | null;
  country: string | null;
  userId?: string | null;
}

/**
 * Records one page view: always an analytics_events row, plus an upsert
 * into visitor_sessions (new row if this session_id hasn't been seen, an
 * update otherwise) so the dashboard can compute sessions/returning
 * visitors without scanning every individual page-view event.
 */
export async function trackPageView(input: PageViewInput): Promise<void> {
  const client = serviceClient();
  if (!client) return;
  try {
    const { deviceType, browser, os } = classifyUserAgent(input.userAgent);

    const { data: existing } = await client
      .from("visitor_sessions")
      .select("id, page_view_count")
      .eq("session_id", input.sessionId)
      .maybeSingle();

    if (existing) {
      await client
        .from("visitor_sessions")
        .update({ last_seen_at: new Date().toISOString(), page_view_count: existing.page_view_count + 1 })
        .eq("id", existing.id);
    } else {
      const { data: priorSession } = await client
        .from("visitor_sessions")
        .select("id")
        .eq("anonymous_visitor_id", input.anonymousVisitorId)
        .limit(1)
        .maybeSingle();

      await client.from("visitor_sessions").insert({
        anonymous_visitor_id: input.anonymousVisitorId,
        session_id: input.sessionId,
        landing_path: input.path,
        referrer: input.referrer,
        device_type: deviceType,
        browser,
        operating_system: os,
        country: input.country,
        page_view_count: 1,
        is_returning: !!priorSession,
      });
    }

    await trackEvent({
      eventType: "page_view",
      userId: input.userId,
      anonymousVisitorId: input.anonymousVisitorId,
      sessionId: input.sessionId,
      path: input.path,
      referrer: input.referrer,
    });
  } catch {
    // Best-effort.
  }
}
