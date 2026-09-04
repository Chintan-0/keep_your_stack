import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Server-side Supabase client for Server Components, Route Handlers, and
// Server Actions. Reads the user's session from cookies, so every query
// made with this client is subject to RLS as that authenticated user —
// there is no service-role bypass here on purpose.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component that can't set cookies (no
            // response to attach to) — middleware refreshes the session
            // on every request, so this is safe to ignore here.
          }
        },
      },
    }
  );
}
