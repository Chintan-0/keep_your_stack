"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Download, Upload, Puzzle, Trash2, LogOut } from "lucide-react";
import { useThemeStore, type Theme } from "@/lib/theme-store";
import { useStore } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { categoryPath } from "@/lib/utils";

const THEME_OPTIONS: { value: Theme; label: string; icon: React.ElementType }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      <div>
        <h2 className="text-[14px] font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-[12.5px] text-text-secondary">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[12px] font-medium text-text-secondary">{label}</label>
      {children}
    </div>
  );
}

function toCsv(resources: ReturnType<typeof useStore.getState>["resources"], tags: ReturnType<typeof useStore.getState>["tags"], stacks: ReturnType<typeof useStore.getState>["stacks"]): string {
  const header = ["Title", "URL", "Description", "Useful For", "Notes", "Category", "Tags", "Stacks", "Created At", "Updated At"];
  const rows = resources.map((r) => [
    r.title,
    r.url,
    r.description,
    r.useCases.join("; "),
    r.notes,
    categoryPath(r.categoryId),
    r.tagIds.map((id) => tags.find((t) => t.id === id)?.name ?? "").filter(Boolean).join("; "),
    r.stackIds.map((id) => stacks.find((s) => s.id === id)?.name ?? "").filter(Boolean).join("; "),
    r.createdAt,
    r.updatedAt,
  ]);
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n");
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resources = useStore((s) => s.resources);
  const archivedResources = useStore((s) => s.archivedResources);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setEmail(user.email ?? "");
      const { data: profile } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
      setName(profile?.name ?? "");
    });
  }, []);

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast.success("Profile saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    if (newPassword.length < 8) {
      toast.error("Password needs to be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setNewPassword("");
    toast.success("Password updated");
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  }

  async function deleteAccount() {
    setDeletingAccount(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete your account.");
    } finally {
      setDeletingAccount(false);
    }
  }

  const allResources = [...resources, ...archivedResources];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Settings</h1>

      <Section title="Account">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet to-accent text-[20px] font-semibold text-white">
            {(name || email || "?").charAt(0).toUpperCase()}
          </div>
          <span className="text-[12.5px] text-text-secondary">{email}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            />
          </Field>
          <Field label="Email">
            <input
              value={email}
              disabled
              title="Contact support to change your email"
              className="h-9 cursor-not-allowed rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2.5 text-[13px] text-text-muted"
            />
          </Field>
        </div>
        <Button size="sm" className="w-fit" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? "Saving…" : "Save Changes"}
        </Button>
      </Section>

      <Section title="Security" description="Change your password.">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
            />
          </Field>
          <Button size="sm" variant="secondary" onClick={changePassword} disabled={savingPassword || !newPassword}>
            {savingPassword ? "Updating…" : "Update Password"}
          </Button>
        </div>
      </Section>

      <Section title="Appearance">
        <Field label="Theme">
          <div className="flex gap-2">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setTheme(o.value)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border px-3 py-2.5 text-[13px] transition-colors cursor-pointer",
                  theme === o.value
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-border-strong text-text-secondary hover:bg-surface-3"
                )}
              >
                <o.icon size={15} /> {o.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 pt-1 font-mono text-[11.5px] text-text-muted">
          <span>⌘K Search</span>
          <span>N New resource</span>
          <span>G then R Resources</span>
          <span>G then S Stacks</span>
          <span>G then F Favorites</span>
          <span>Esc Close modal</span>
        </div>
      </Section>

      <Section title="Browser Extension" description="Save pages without leaving your browser.">
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[13px] text-text-primary">
            <Puzzle size={15} /> Not installed
          </span>
          <Button size="sm" variant="secondary" disabled>
            Install — Coming Soon
          </Button>
        </div>
      </Section>

      <Section title="Data" description="Your resources, always exportable — you're never locked in.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              download("keepyourstack-export.json", JSON.stringify(allResources, null, 2), "application/json");
              toast.success("Exported resources.json");
            }}
          >
            <Download size={14} /> Export JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              download("keepyourstack-export.csv", toCsv(allResources, tags, stacks), "text/csv");
              toast.success("Exported resources.csv");
            }}
          >
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push("/import")}>
            <Upload size={14} /> Import Bookmarks
          </Button>
        </div>
      </Section>

      <Section title="Danger Zone">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={signOut}>
            <LogOut size={14} /> Sign Out
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDeleteAccount(true)}>
            <Trash2 size={14} /> Delete Account
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
        onConfirm={deleteAccount}
        title="Delete your account?"
        description="This permanently deletes your resources, stacks, and notes. This action cannot be undone."
        confirmLabel={deletingAccount ? "Deleting…" : "Delete Account"}
        danger
      />
    </div>
  );
}
