import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { trackEvent } from "@/lib/data/analytics";
import { safeNext } from "@/lib/safe-redirect";

// Handles the redirect back from Supabase — either an email link (signup
// confirmation or password recovery) or, now, the Google OAuth round trip
// (see GoogleSignInButton). Both hand this route the same thing: a
// one-time `code` to exchange for a real session, then send the user on
// to wherever they were headed.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Only fire an analytics event for the Google path — the email-link
      // flows through this same route never tracked a "login" event here,
      // and this shouldn't start double-counting those.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.app_metadata?.provider === "google") {
        void trackEvent({ eventType: "login", userId: user.id, metadata: { provider: "google" } });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=Could not verify that link`);
}
