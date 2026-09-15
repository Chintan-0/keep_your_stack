import "server-only";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient as createServiceUrlClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { requireUser } from "./auth";

type ServiceClient = ReturnType<typeof createServiceUrlClient<Database>>;

let cachedServiceClient: ServiceClient | null = null;

/**
 * The service-role client bypasses RLS entirely — it must never be reached
 * except from a route that has already independently verified the caller
 * is an admin (see requireAdmin below). Never imported into anything
 * client-side; "server-only" above throws at build time if that ever
 * happens by mistake.
 */
function getServiceRoleClient(): ServiceClient {
  if (cachedServiceClient) return cachedServiceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured — admin/analytics routes cannot run without it.");
  }
  cachedServiceClient = createServiceUrlClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedServiceClient;
}

/**
 * Gate for every /admin page and /api/admin/* route (and analytics reads).
 *
 * Two checks, both server-side, neither trusting anything the client sent:
 *  1. requireUser() — Supabase's own server-verified auth.getUser(), same
 *     as every other route in the app. Confirms who's really asking.
 *  2. A row in admin_users for that verified user id. admin_users has RLS
 *     enabled with zero policies (see the migration's own comment) — no
 *     anon/authenticated Supabase call can ever read or write it, so this
 *     check can only be answered from server-side code holding the
 *     service-role key, which is exactly what happens here. There is no
 *     client-supplied "isAdmin" flag anywhere in this path.
 *
 * Returns `forbidden` (a ready-to-return NextResponse) for both "not
 * signed in" (401, from requireUser) and "signed in but not an admin"
 * (403) — callers just check `if (forbidden) return forbidden;`.
 */
export async function requireAdmin(request?: NextRequest) {
  const { user, unauthorized } = await requireUser(request);
  if (unauthorized || !user) {
    return { user: null, service: null as ServiceClient | null, forbidden: unauthorized! };
  }

  const service = getServiceRoleClient();
  const { data, error } = await service.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (error) {
    return {
      user,
      service: null as ServiceClient | null,
      forbidden: NextResponse.json({ error: "Couldn't verify admin access." }, { status: 500 }),
    };
  }
  if (!data) {
    return {
      user,
      service: null as ServiceClient | null,
      forbidden: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  return { user, service, forbidden: null as null };
}

/** Same check, for a Server Component (the /admin page itself) rather than a route handler — no Request object, cookie session only. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const { forbidden } = await requireAdmin();
  return !forbidden;
}
