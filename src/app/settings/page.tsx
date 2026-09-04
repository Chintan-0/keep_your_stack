"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Download, Upload, Puzzle, Trash2 } from "lucide-react";
import { useThemeStore, type Theme } from "@/lib/theme-store";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";

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

export default function SettingsPage() {
  const router = useRouter();
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const [name, setName] = useState("Alex Rivera");
  const [email, setEmail] = useState("mrpgraphix64@gmail.com");
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  function exportData() {
    const data = JSON.stringify(resources, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keepyourstack-export.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exported resources.json");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Settings</h1>

      <Section title="Account">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet to-accent text-[20px] font-semibold text-white">
            {name.charAt(0)}
          </div>
          <Button variant="secondary" size="sm">
            Change Avatar
          </Button>
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
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            />
          </Field>
        </div>
        <Button size="sm" className="w-fit" onClick={() => toast.success("Profile saved")}>
          Save Changes
        </Button>
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
      </Section>

      <Section title="Preferences">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default view">
            <select className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none">
              <option>Grid</option>
              <option>List</option>
            </select>
          </Field>
          <Field label="Default stack for new resources">
            <select className="h-9 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none">
              <option>None</option>
              {stacks.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
        </div>
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

      <Section title="Data" description="Your resources, always exportable.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportData}>
            <Download size={14} /> Export Resources
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push("/import")}>
            <Upload size={14} /> Import Bookmarks
          </Button>
        </div>
      </Section>

      <Section title="Danger Zone">
        <Button variant="danger" size="sm" className="w-fit" onClick={() => setConfirmDeleteAccount(true)}>
          <Trash2 size={14} /> Delete Account
        </Button>
      </Section>

      <ConfirmDialog
        open={confirmDeleteAccount}
        onClose={() => setConfirmDeleteAccount(false)}
        onConfirm={() => toast.error("Account deletion is disabled in this demo.")}
        title="Delete your account?"
        description="This permanently deletes your resources, stacks, and notes. This action cannot be undone."
        confirmLabel="Delete Account"
        danger
      />
    </div>
  );
}
