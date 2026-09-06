import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceUrlClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { corsPreflight, withCors } from "@/lib/cors";

// Used only by the Chrome extension to keep its stored session alive
// without ever holding Supabase URL/key knowledge itself beyond what it's
// handed here — this route is the extension's one auth-refresh dependency
// on the backend. No service-role key involved; a refresh token only ever
// proves who the *user* already was, same as the web app's own session
// cookie refresh in src/lib/supabase/middleware.ts.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const refreshToken = body?.refreshToken;
  if (typeof refreshToken !== "string" || !refreshToken) {
    return withCors(request, NextResponse.json({ error: "refreshToken is required" }, { status: 400 }));
  }

  const supabase = createServiceUrlClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    return withCors(request, NextResponse.json({ error: "Session expired" }, { status: 401 }));
  }

  return withCors(
    request,
    NextResponse.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at ?? null,
    })
  );
}

export function OPTIONS(request: NextRequest) {
  return corsPreflight(request);
}
