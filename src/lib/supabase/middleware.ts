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
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isStaticAsset = pathname.startsWith("/_next") || pathname === "/favicon.ico";
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
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
