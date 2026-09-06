import { AppShell } from "@/components/app-shell";

// No auth in this phase — the app opens straight to the dashboard as a
// single local user. See src/lib/user.ts for the placeholder identity.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
