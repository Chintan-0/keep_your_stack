"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Layers } from "lucide-react";
import { useUIStore } from "@/lib/ui-store";
import { Button } from "@/components/ui/button";

// A handful of real, curated tips — presentational copy (like the Home
// search page's own EXAMPLES array), never a statistic or activity claim.
const TIPS = [
  "A well-organized stack turns the internet into a superpower.",
  "Stacks group tools by how you actually use them, not just where you found them.",
  "Tag as you save — future-you searches by what a tool does, not its name.",
  "Stack Studio turns a messy bookmark export into an organized library in minutes.",
];

function greetingForHour(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HeroBanner({
  totalResources,
  stackCount,
  hasHydrated,
}: {
  totalResources: number;
  stackCount: number;
  hasHydrated: boolean;
}) {
  const openAddResource = useUIStore((s) => s.openAddResource);
  // Hour-of-day depends on the client's real clock, which can genuinely
  // differ from the server's (different timezone) — "Welcome back" is what
  // both server and client render on the first (hydration) pass; the real,
  // hour-based greeting is set once after mount, the one legitimate use of
  // an effect for this (same justified pattern as src/app/(app)/search/
  // page.tsx's own query-from-URL effect).
  const [greeting, setGreeting] = useState("Welcome back");
  const [name, setName] = useState<string | null>(null);
  // Math.random() during the initial render would pick a different tip on
  // the server than on the client's hydration pass — a real mismatch
  // (confirmed live), not just a theoretical one. The fixed first tip is
  // what both sides render; a random one is swapped in after mount, same
  // effect as the greeting/name above.
  const [tip, setTip] = useState(TIPS[0]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGreeting(greetingForHour(new Date().getHours()));
    setTip(TIPS[Math.floor(Math.random() * TIPS.length)]);
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        const full = typeof d.name === "string" ? d.name : null;
        // First name only, and only when it looks like a real name rather
        // than a bare email address (no "@") — "Good morning,
        // dev@keepyourstack.local" reads worse than just omitting it.
        if (full && !full.includes("@")) setName(full.trim().split(/\s+/)[0]);
      })
      .catch(() => {});
  }, []);

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-xl)] border border-border-strong">
      {/* Atmospheric layered gradient — built entirely from the existing
          semantic tokens (accent/violet/cyan), not new hardcoded colors,
          so it stays correct in both themes without a separate light-mode
          treatment. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 420px at 15% 0%, color-mix(in srgb, var(--accent) 35%, transparent), transparent 60%), radial-gradient(700px 380px at 85% 10%, color-mix(in srgb, var(--violet) 30%, transparent), transparent 65%), radial-gradient(600px 500px at 50% 120%, color-mix(in srgb, var(--cyan) 22%, transparent), transparent 70%), var(--surface-2)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text-primary) 1px, transparent 1px), linear-gradient(90deg, var(--text-primary) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="relative flex flex-col gap-6 p-7 sm:p-9 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3">
          <h1 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[32px]">
            {greeting}
            {name ? `, ${name}` : ""} <span aria-hidden="true">👋</span>
          </h1>
          <p className="text-[14.5px] text-text-secondary">Your internet toolbox, organized.</p>
          {hasHydrated && (
            <p className="font-mono text-[12.5px] text-text-muted">
              You have {totalResources.toLocaleString()} saved resource{totalResources === 1 ? "" : "s"}
              {stackCount > 0 ? ` across ${stackCount} stack${stackCount === 1 ? "" : "s"}.` : "."}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <Button onClick={() => openAddResource()}>
              <Plus size={14} /> Add Resource
            </Button>
            <Link
              href="/stacks"
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border-strong bg-surface-3/60 px-3.5 py-2 text-[13px] font-medium text-text-primary backdrop-blur-sm transition-colors hover:bg-surface-hover cursor-pointer"
            >
              <Layers size={14} /> Explore Stacks
            </Link>
          </div>
        </div>

        <div className="hidden max-w-[240px] shrink-0 rounded-[var(--radius-lg)] border border-border-strong bg-surface/70 p-4 backdrop-blur-md lg:block">
          <p className="text-[13px] italic leading-5 text-text-secondary">&ldquo;{tip}&rdquo;</p>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-accent">Keep building</p>
        </div>
      </div>
    </section>
  );
}
