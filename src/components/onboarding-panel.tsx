"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Upload, Plus, Package, Puzzle, X, Circle, CheckCircle2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

// A brand-new account is the only one this ever shows for — a real
// library (however it got that large: manual saves, an old import, demo
// data) should never see a "getting started" panel again. Gated on a
// count rather than solely on `onboarding_dismissed_at` so an established
// account is protected from this even if it somehow never got dismissed
// (e.g. it existed before this feature shipped, so the column is null by
// default) — see the Phase 17 report for why a pure timestamp gate alone
// felt too fragile for that case.
const GRADUATED_RESOURCE_COUNT = 15;
const HAS_SEARCHED_KEY = "kys_has_searched_once";

function track(eventType: "onboarding_started" | "onboarding_completed" | "onboarding_skipped", label?: string) {
  try {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ eventType, metadata: label ? { label } : undefined }),
    }).catch(() => {});
  } catch {
    // Never let onboarding tracking break onboarding.
  }
}

/** Set by the search page the first time a query actually runs — read here, never written here. */
export function markSearchPerformed() {
  try {
    localStorage.setItem(HAS_SEARCHED_KEY, "1");
  } catch {
    // Private browsing / storage disabled — the checklist item just won't tick itself off. Not worth surfacing an error for.
  }
}

export function OnboardingPanel() {
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const openAddResource = useUIStore((s) => s.openAddResource);

  const [dismissedAt, setDismissedAt] = useState<string | null | "loading">("loading");
  const [hasSearched, setHasSearched] = useState(false);
  const startedTracked = useRef(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasSearched(typeof window !== "undefined" && localStorage.getItem(HAS_SEARCHED_KEY) === "1");
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setDismissedAt(d.onboardingDismissedAt ?? null))
      .catch(() => setDismissedAt(null));
  }, []);

  const active = resources.filter((r) => !r.isArchived);
  const hasResource = active.length > 0;
  const hasContext = active.some((r) => r.categoryId || r.tagIds.length > 0 || r.notes.trim() || r.useCases.length > 0);
  const hasStack = stacks.length > 0;
  const allDone = hasResource && hasContext && hasStack && hasSearched;

  const eligible =
    hasHydrated && dismissedAt !== "loading" && dismissedAt === null && active.length <= GRADUATED_RESOURCE_COUNT;

  useEffect(() => {
    if (eligible && !startedTracked.current) {
      startedTracked.current = true;
      track("onboarding_started");
    }
  }, [eligible]);

  const dismiss = async (eventLabel: "onboarding_completed" | "onboarding_skipped") => {
    setDismissedAt(new Date().toISOString());
    track(eventLabel);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissOnboarding: true }),
      });
    } catch {
      // Best-effort — worst case it reappears next session, not the end of the world.
    }
  };

  useEffect(() => {
    if (!eligible || !allDone) return;
    // Deferred a tick rather than called synchronously in the effect body
    // — avoids the cascading-render lint rule for a setState reachable
    // directly from an effect; a same-tick vs. next-tick auto-dismiss is
    // imperceptible here.
    const timer = setTimeout(() => void dismiss("onboarding_completed"), 0);
    return () => clearTimeout(timer);
  }, [eligible, allDone]);

  if (!eligible || allDone) return null;

  if (!hasResource) {
    return (
      <section className="flex flex-col gap-4 rounded-[var(--radius-xl)] border border-accent/25 bg-accent-soft/40 p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-semibold tracking-tight text-text-primary">Welcome to your new toolbox.</h2>
            <p className="mt-1 max-w-md text-[13px] text-text-secondary">
              Save the useful things you find online, give them context, and find them when you actually need them.
            </p>
          </div>
          <button
            onClick={() => void dismiss("onboarding_skipped")}
            aria-label="Skip onboarding"
            className="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface-3 hover:text-text-primary cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <OnboardingChoice
            icon={Plus}
            title="Add a resource"
            description="Save something useful right now."
            onClick={() => {
              track("onboarding_started", "add-resource");
              openAddResource();
            }}
          />
          <OnboardingChoice
            icon={Upload}
            title="Import bookmarks"
            description="Bring over your existing browser bookmarks."
            href="/stack-studio"
            onClick={() => track("onboarding_started", "import")}
          />
          <OnboardingChoice
            icon={Package}
            title="Start empty"
            description="Explore the library first."
            onClick={() => void dismiss("onboarding_skipped")}
          />
        </div>

        <Link
          href="/extension"
          onClick={() => track("onboarding_started", "extension")}
          className="flex items-center gap-2 text-[12.5px] text-text-secondary hover:text-accent"
        >
          <Puzzle size={13} /> Or install the Chrome extension to save from your browser.
        </Link>
      </section>
    );
  }

  const items: { label: string; done: boolean }[] = [
    { label: "Save your first resource", done: hasResource },
    { label: "Give it context", done: hasContext },
    { label: "Create your first Stack", done: hasStack },
    { label: "Find something with Search", done: hasSearched },
  ];

  return (
    <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-text-primary">Your toolbox</p>
        <button
          onClick={() => void dismiss("onboarding_skipped")}
          aria-label="Dismiss checklist"
          className="rounded-md p-0.5 text-text-muted hover:bg-surface-3 hover:text-text-primary cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {items.map((item) => (
          <span
            key={item.label}
            className={cn("flex items-center gap-1.5 text-[12.5px]", item.done ? "text-text-muted line-through" : "text-text-secondary")}
          >
            {item.done ? <CheckCircle2 size={14} className="text-success" /> : <Circle size={14} className="text-text-muted" />}
            {item.label}
          </span>
        ))}
      </div>
    </section>
  );
}

function OnboardingChoice({
  icon: Icon,
  title,
  description,
  href,
  onClick,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="flex h-full flex-col gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface p-3.5 text-left transition-colors hover:border-accent/40 hover:bg-surface-2">
      <Icon size={16} className="text-accent" />
      <p className="text-[13px] font-medium text-text-primary">{title}</p>
      <p className="text-[11.5px] text-text-secondary">{description}</p>
    </div>
  );
  if (href) {
    return (
      <Link href={href} onClick={onClick}>
        {content}
      </Link>
    );
  }
  return (
    <button onClick={onClick} className="cursor-pointer">
      {content}
    </button>
  );
}
