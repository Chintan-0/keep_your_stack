"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Browser-side Supabase client. Safe to use in Client Components for
// reading data the RLS policies already scope to the current user, and
// for auth (sign in/up/out) — those calls are meant to happen client-side.
// Anything that writes resources/stacks/tags data goes through the
// server-side data layer (src/lib/data/*) instead of calling this
// directly, so validation/normalization/dup-detection stays in one place.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
