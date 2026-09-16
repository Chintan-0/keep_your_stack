import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static files, Next internals, public
    // downloads (e.g. the Chrome extension zip — see public/downloads/ and
    // src/app/(app)/extension/page.tsx), and Phase 13's public-sharing
    // routes (/@username[/slug], /share/token, and the internal /u/...
    // path next.config.ts's rewrite resolves those to) — viewing a public
    // or unlisted stack must never require being signed in. Middleware
    // runs on the pre-rewrite URL, so it's /@... it actually sees here,
    // not /u/...; /u/ is excluded too as defense in depth regardless of
    // ordering.
    "/((?!_next/static|_next/image|favicon.ico|downloads/|@[^/]+|share/|u/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip)$).*)",
  ],
};
