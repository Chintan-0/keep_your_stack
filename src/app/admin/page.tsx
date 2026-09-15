import { redirect } from "next/navigation";
import { isCurrentUserAdmin } from "@/lib/data/admin-auth";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

// Server-side gate — the ENTIRE security boundary for this page. No
// client-side "isAdmin" flag exists anywhere; isCurrentUserAdmin() re-runs
// the same requireAdmin() check every /api/admin/* route uses (real
// server-verified auth.getUser(), then a row lookup in admin_users via the
// service-role client, which no browser-side Supabase call can ever read —
// see src/lib/data/admin-auth.ts). A non-admin (including a signed-out
// visitor) gets redirected to the ordinary dashboard, never a hint that an
// admin panel exists.
export default async function AdminPage() {
  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) redirect("/");

  return <AdminDashboard />;
}
