import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth — middleware already redirects unauthenticated
  // requests away from every route in this group.
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase.from("profiles").select("name, email").eq("id", user.id).maybeSingle();

  return (
    <AppShell userEmail={profile?.email ?? user.email ?? ""} userName={profile?.name ?? user.email ?? "Account"}>
      {children}
    </AppShell>
  );
}
