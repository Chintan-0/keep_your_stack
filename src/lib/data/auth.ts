import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient as createServiceUrlClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";

/**
 * Every API route uses this instead of trusting a client-supplied user id.
 *
 * Two ways to authenticate:
 *  - Cookie session (the web app) — the default, used when no `request` is
 *    passed or it carries no Authorization header.
 *  - Bearer token (the Chrome extension, a different origin with no shared
 *    cookie jar) — pass the route's `request` in and an
 *    `Authorization: Bearer <supabase access token>` header is honored.
 *    The token is validated with Supabase directly (`auth.getUser(jwt)`),
 *    and the returned client carries that same JWT on every subsequent
 *    query, so RLS still scopes everything to that user — no bypass, no
 *    service-role key involved.
 */
export async function requireUser(request?: NextRequest) {
  const bearer = request?.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (bearer) {
    const supabase = createServiceUrlClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${bearer}` } } }
    );
    const { data, error } = await supabase.auth.getUser(bearer);
    if (error || !data.user) {
      return { supabase, user: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { supabase, user: data.user, unauthorized: null as null };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null, unauthorized: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { supabase, user, unauthorized: null as null };
}
