"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, ArrowRight, Package, Star, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { ResourceCard } from "@/components/resource-card";
import { StackCard } from "@/components/stack-card";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

const EXAMPLES = ["compress webp", "test graphql", "format prisma", "convert svg", "database tool"];

export default function DashboardPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const stats = useStore((s) => s.stats);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const loadDemoData = useStore((s) => s.loadDemoData);
  const [loadingDemoData, setLoadingDemoData] = useState(false);

  async function handleLoadDemoData() {
    setLoadingDemoData(true);
    try {
      await loadDemoData();
    } finally {
      setLoadingDemoData(false);
    }
  }

  // `resources` is only the newest page (see store.hydrate), not the whole
  // library — fine for "Recently Added" (already newest-first, 8 « page
  // size) and the favorites preview (first 4 among the newest — the exact
  // rare case where none of a user's favorites are recent enough to be in
  // that page just hides the section, same as having zero favorites).
  // The stat pills use the dedicated `stats` counts instead, which cover
  // the real total regardless of how much has been paginated in.
  const active = useMemo(() => resources.filter((r) => !r.isArchived), [resources]);
  const favorites = active.filter((r) => r.isFavorite);
  const recentlyAdded = active.slice(0, 8);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Hero search */}
      <section className="rounded-[var(--radius-xl)] border border-border bg-gradient-to-br from-surface-2 via-surface to-surface-2 p-6 sm:p-9">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-3 px-3 py-1 font-mono text-[11px] text-text-secondary">
            <Sparkles size={12} className="text-accent" /> {stats?.total ?? active.length} resources saved
          </span>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[32px]">
            What are you looking for?
          </h1>
          <p className="max-w-md text-[14px] text-text-secondary">
            Search your stack by tool, use case, tag, or note.
          </p>

          <form onSubmit={submitSearch} className="relative w-full">
            <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="compress webp, test graphql, jwt decoder…"
              className="h-12 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-3 pl-11 pr-16 text-[14px] text-text-primary placeholder-text-muted shadow-inner focus:border-accent focus:outline-none"
            />
            <kbd className="kbd absolute right-3.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
              ⌘K
            </kbd>
          </form>

          <div className="flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => router.push(`/search?q=${encodeURIComponent(ex)}`)}
                className="rounded-full border border-border bg-surface-2 px-3 py-1.5 font-mono text-[12px] text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>

          <Button size="lg" onClick={() => openAddResource()} className="mt-1">
            <Plus size={16} /> Add Resource
          </Button>
        </div>
      </section>

      {/* Quick stats */}
      <section className="grid grid-cols-3 gap-3">
        <StatPill label="Resources" value={stats?.total ?? active.length} icon={Package} />
        <StatPill label="Favorites" value={stats?.favorites ?? favorites.length} icon={Star} accent="text-warning" />
        <StatPill label="Added recently" value={stats?.addedRecently ?? 0} icon={Sparkles} accent="text-cyan" />
      </section>

      {/* Recently added */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Recently Added" href="/recent" />
        {!hasHydrated ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ResourceCardSkeleton key={i} />
            ))}
          </div>
        ) : recentlyAdded.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Your toolbox is empty."
            description="Save your first useful resource."
            action={
              <div className="flex flex-col items-center gap-2">
                <Button onClick={() => openAddResource()} size="sm">
                  <Plus size={14} /> Add Resource
                </Button>
                <button
                  onClick={handleLoadDemoData}
                  disabled={loadingDemoData}
                  className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
                >
                  {loadingDemoData ? "Loading…" : "or load some example resources"}
                </button>
              </div>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentlyAdded.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        )}
      </section>

      {/* Your stacks */}
      <section className="flex flex-col gap-3">
        <SectionHeader title="Your Stacks" href="/stacks" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {stacks.map((s) => (
            <StackCard key={s.id} stack={s} count={active.filter((r) => r.stackIds.includes(s.id)).length} />
          ))}
        </div>
      </section>

      {/* Favorites */}
      {favorites.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader title="Favorites" href="/favorites" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {favorites.slice(0, 4).map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      <Link
        href={href}
        className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary hover:text-accent"
      >
        View all <ArrowRight size={13} />
      </Link>
    </div>
  );
}

function StatPill({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5">
      <div className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-surface-3 ${accent ?? "text-accent"}`}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[17px] font-semibold leading-tight text-text-primary">{value}</p>
        <p className="text-[11.5px] text-text-secondary">{label}</p>
      </div>
    </div>
  );
}
