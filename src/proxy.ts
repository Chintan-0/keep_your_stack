import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static files, Next internals, and public
    // downloads (e.g. the Chrome extension zip — see public/downloads/ and
    // src/app/(app)/extension/page.tsx) — those must be fetchable by
    // anyone, signed in or not, so they can't be behind the session check
    // below at all.
    "/((?!_next/static|_next/image|favicon.ico|downloads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|zip)$).*)",
  ],
};
