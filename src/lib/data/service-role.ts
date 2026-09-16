import "server-only";
import { createClient as createServiceUrlClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

// Shared service-role client factory — bypasses RLS entirely, so every
// caller of getServiceRoleClient() is responsible for its own explicit
// authorization check in application code before running a query (admin
// routes: requireAdmin(); public stack/profile routes: an explicit
// visibility/token check — see src/lib/data/public-stacks.ts). Never
// imported into anything client-side; "server-only" enforces that at
// build time.
type ServiceClient = ReturnType<typeof createServiceUrlClient<Database>>;
let cached: ServiceClient | null = null;

export function getServiceRoleClient(): ServiceClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  cached = createServiceUrlClient<Database>(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}
