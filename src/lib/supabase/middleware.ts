import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./types";

const PUBLIC_PATHS = ["/auth/login", "/auth/sign-up", "/auth/forgot-password", "/auth/reset-password", "/auth/callback"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // IMPORTANT: this refreshes the session token, and must run on every
  // request that might read the session — do not remove or short-circuit
  // it before this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  // Public-sharing routes (Part D/E/H) — viewing a public profile,
  // public stack, or unlisted share link must never require signing in.
  // Middleware sees the pre-rewrite path (/@username[/slug], /share/token)
  // — /u/ (what next.config.ts's rewrite resolves those to) is included
  // too as defense in depth.
  const isPublicSharingPath = /^\/@[^/]+(\/[^/]+)?$/.test(pathname) || pathname.startsWith("/share/") || pathname.startsWith("/u/");
  // "/" is the public marketing homepage (Phase 15.5) — never gated behind
  // login. It redirects an already-signed-in visitor on to /home itself
  // (see src/app/page.tsx), so this only ever needs to let an
  // *unauthenticated* request through here.
  //
  // "/opengraph-image" is Next.js's file-based convention for
  // src/app/opengraph-image.tsx (Phase 17's homepage social-preview
  // image) — found broken in production: a crawler (Discord/Slack/X)
  // fetching it got redirected to the login page instead of the image,
  // since this route doesn't match "/" or any other public-path rule.
  // The equivalent per-Stack route (src/app/u/[username]/[slug]/
  // opengraph-image.tsx) already worked because it's nested under /u/,
  // already public via isPublicSharingPath above.
  const isPublicPath =
    pathname === "/" || pathname === "/opengraph-image" || isPublicSharingPath || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // /downloads/ (e.g. the Chrome extension zip) must be fetchable by
  // anyone, not just signed-in users — the proxy's own matcher already
  // excludes it so this shouldn't normally even run for that path, but
  // this is the actual redirect decision, so it's worth being correct
  // here too rather than relying solely on the matcher regex staying right.
  const isStaticAsset =
    pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname.startsWith("/downloads/");
  // API routes handle their own auth (see src/lib/data/auth.ts's requireUser)
  // and return a proper 401 JSON body — including for the Chrome extension's
  // Authorization: Bearer requests, which this middleware only ever checks
  // via cookies. Redirecting those to an HTML login page instead of letting
  // the route respond would break every extension request.
  const isApiRoute = pathname.startsWith("/api/");

  if (!user && !isPublicPath && !isStaticAsset && !isApiRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/auth/login" || pathname === "/auth/sign-up")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/home";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
