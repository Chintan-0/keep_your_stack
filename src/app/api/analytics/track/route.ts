import { NextRequest, NextResponse } from "next/server";
import { trackPageView } from "@/lib/data/analytics";
import { createClient } from "@/lib/supabase/server";

// Public, unauthenticated by design — this is what records anonymous
// visitor page views (see src/components/analytics-tracker.tsx, which is
// the only thing that ever calls it). No admin/user data is ever readable
// through this route — it only ever writes one page_view event + upserts
// one visitor_sessions row via the service-role client (analytics.ts),
// and always responds `{ok:true}` regardless of whether the write actually
// succeeded, since tracking must never surface as an error to the caller.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const anonymousVisitorId = typeof body?.visitorId === "string" ? body.visitorId.slice(0, 100) : null;
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId.slice(0, 100) : null;
  const path = typeof body?.path === "string" ? body.path.slice(0, 500) : null;

  if (!anonymousVisitorId || !sessionId || !path) {
    // Malformed beacon — not an error worth surfacing, just don't record it.
    return NextResponse.json({ ok: true });
  }

  // A signed-in visitor's page views still get attributed to their user_id
  // too (best-effort — cookie session only, no bearer/extension traffic
  // reaches this route), so "active users" can be computed from real
  // browsing, not just explicit product actions.
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // Not signed in, or the check failed — fine, this is still a valid anonymous page view.
  }

  const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 500) : null;
  // Vercel attaches this itself from its own edge network — no IP is ever
  // read or stored here to get a country. Absent entirely outside Vercel
  // (e.g. local dev), which is fine — country is optional everywhere it's used.
  const country = request.headers.get("x-vercel-ip-country");

  void trackPageView({
    anonymousVisitorId,
    sessionId,
    path,
    referrer,
    userAgent: request.headers.get("user-agent"),
    country,
    userId,
  });

  return NextResponse.json({ ok: true });
}
