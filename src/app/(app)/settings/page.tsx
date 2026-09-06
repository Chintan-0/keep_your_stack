"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sun, Moon, Monitor, Download, Upload, Puzzle, RotateCcw } from "lucide-react";
import { useThemeStore, type Theme } from "@/lib/theme-store";
import { useStore } from "@/lib/store";
import { DEMO_USER } from "@/lib/user";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn, categoryPath } from "@/lib/utils";

const APP_VERSION = "0.1.0";

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

function toCsv(
  resources: ReturnType<typeof useStore.getState>["resources"],
  tags: ReturnType<typeof useStore.getState>["tags"],
  stacks: ReturnType<typeof useStore.getState>["stacks"]
): string {
  const header = [
    "Title",
    "URL",
    "Description",
    "Useful For",
    "Notes",
    "Category",
    "Tags",
    "Stacks",
    "Created At",
    "Updated At",
  ];
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
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const resetDemoData = useStore((s) => s.resetDemoData);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Settings</h1>

      <Section title="Your Profile">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-violet to-accent text-[20px] font-semibold text-white">
            {DEMO_USER.name.charAt(0)}
          </div>
          <div>
            <p className="text-[14px] font-medium text-text-primary">{DEMO_USER.name}</p>
            <p className="text-[12.5px] text-text-secondary">{DEMO_USER.tagline}</p>
          </div>
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
      </Section>

      <Section title="Preferences">
        <Field label="Default view for Resources / Favorites / Recently Added">
          <select className="h-9 max-w-xs rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none">
            <option>Grid</option>
            <option>List</option>
          </select>
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

      <Section title="Browser Extension" description="Save the page you're viewing without leaving your browser.">
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface-2 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-[13px] text-text-primary">
            <Puzzle size={15} /> Coming next — not installed yet
          </span>
          <Button size="sm" variant="secondary" onClick={() => router.push("/extension")}>
            Preview
          </Button>
        </div>
      </Section>

      <Section title="Data" description="Your resources, always exportable — you're never locked in.">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              download("keepyourstack-export.json", JSON.stringify(resources, null, 2), "application/json");
              toast.success("Exported resources.json");
            }}
          >
            <Download size={14} /> Export JSON
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              download("keepyourstack-export.csv", toCsv(resources, tags, stacks), "text/csv");
              toast.success("Exported resources.csv");
            }}
          >
            <Download size={14} /> Export CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push("/import")}>
            <Upload size={14} /> Import Bookmarks
          </Button>
        </div>
        <div className="border-t border-border pt-4">
          <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw size={14} /> Reset Demo Data
          </Button>
        </div>
      </Section>

      <Section title="About">
        <div className="flex items-center justify-between text-[13px] text-text-secondary">
          <span>KeepYourStack</span>
          <span className="font-mono text-[12px] text-text-muted">v{APP_VERSION}</span>
        </div>
      </Section>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetDemoData();
          toast.success("Restored the demo dataset");
        }}
        title="Reset your local KeepYourStack data?"
        description="This will remove your current local changes and restore the demo dataset."
        confirmLabel="Reset"
        danger
      />
    </div>
  );
}
