"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { ResourceCard } from "@/components/resource-card";
import { StackCard } from "@/components/stack-card";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { needsReview as isNeedsReview, cn } from "@/lib/utils";
import { SEMANTIC_COLOR_CLASSES, tagColor, type SemanticColor } from "@/lib/colors";

// Fixed, hand-placed positions (not randomized — stable across renders and
// reloads) for the small real-tag chips floating around the hero on large
// screens only. Kept well clear of the search field's own horizontal
// space (roughly 25%–75% x, center y) so they never overlap the input.
const FLOATING_CHIP_POSITIONS: React.CSSProperties[] = [
  { left: "6%", top: "8%" },
  { right: "8%", top: "14%" },
  { left: "10%", bottom: "10%" },
  { right: "6%", bottom: "18%" },
  { left: "50%", top: "2%", transform: "translateX(-50%)" },
];

const EXAMPLES: { text: string; color: SemanticColor }[] = [
  { text: "compress webp", color: "cyan" },
  { text: "test graphql", color: "blue" },
  { text: "format prisma", color: "violet" },
  { text: "convert svg", color: "warning" },
  { text: "database tool", color: "cyan" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const linkChecks = useStore((s) => s.linkChecks);
  const stats = useStore((s) => s.stats);
  const hasHydrated = useStore((s) => s.hasHydrated);

  // `resources` is only the newest page (see store.hydrate), not the whole
  // library — fine for "Recently Added" (already newest-first, 8 « page
  // size), the favorites preview, and the popular-tags tally (a "what's
  // trending in what I've loaded" signal, same limitation the sidebar's
  // own popular-tags list already has — not new). The stat strip uses the
  // dedicated `stats` counts instead, which cover the real total
  // regardless of how much has been paginated in.
  const active = useMemo(() => resources.filter((r) => !r.isArchived), [resources]);
  const favorites = active.filter((r) => r.isFavorite);
  const recentlyAdded = active.slice(0, 8);
  const needsReviewCount = active.filter((r) => isNeedsReview(r, linkChecks[r.id]?.status)).length;
  const healthyCount = Math.max(0, active.length - needsReviewCount);

  const popularTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of active) for (const id of r.tagIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => tags.find((t) => t.id === id))
      .filter(Boolean) as { id: string; name: string }[];
  }, [active, tags]);

  // A handful of the user's own real tags/categories, gently placed around
  // the hero (desktop only — see the className below) — real workspace
  // context, not decorative placeholder words (§9).
  const floatingChips = useMemo(() => popularTags.slice(0, 5), [popularTags]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  return (
    <div className="flex flex-col gap-11">
      <OnboardingPanel />

      {/* Hero search — the one large, primary interaction on this page.
          No card border/background box around it and no Add Resource
          button underneath: the search itself is the hero action, kept
          visually distinct from the compact utility search in the top
          bar (⌘K) by scale, placement, and the supporting copy around it.
          A soft multi-tone radial gradient (indigo/blue/cyan, very low
          opacity) and a handful of the user's own real tags sit behind
          it for depth — decorative but never fake data, and dropped
          entirely below lg so small screens stay clean and fast (§29). */}
      <section className="relative flex flex-col items-center gap-5 overflow-hidden pt-2 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden lg:block"
          style={{
            background:
              "radial-gradient(480px 280px at 20% 15%, rgba(111,123,255,0.10), transparent 70%), radial-gradient(420px 260px at 82% 20%, rgba(91,157,255,0.08), transparent 70%), radial-gradient(460px 300px at 50% 100%, rgba(34,211,238,0.07), transparent 70%)",
          }}
        />
        {floatingChips.length > 0 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
            {floatingChips.map((t, i) => {
              const pos = FLOATING_CHIP_POSITIONS[i % FLOATING_CHIP_POSITIONS.length];
              const palette = SEMANTIC_COLOR_CLASSES[tagColor(t.name)];
              return (
                <span
                  key={t.id}
                  className={cn(
                    "absolute rounded-full border border-transparent px-2.5 py-1 font-mono text-[11px] opacity-60",
                    palette.soft,
                    palette.text
                  )}
                  style={pos}
                >
                  {t.name}
                </span>
              );
            })}
          </div>
        )}

        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">Your toolbox</span>
        <h1 className="text-[30px] font-semibold tracking-tight text-text-primary sm:text-[38px]">
          What are you looking for?
        </h1>
        <p className="max-w-sm text-[14px] text-text-secondary">Search by tool, use case, tag, or note.</p>

        <form onSubmit={submitSearch} className="relative w-full max-w-2xl">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
          <label htmlFor="home-search" className="sr-only">
            Search your library
          </label>
          <input
            id="home-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="compress webp, test graphql, jwt decoder…"
            className="h-14 w-full rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 pl-12 pr-16 text-[15px] text-text-primary placeholder-text-muted shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] transition-shadow duration-200 focus:border-accent focus:shadow-[0_0_0_4px_var(--accent-soft),0_0_24px_-8px_var(--cyan)] focus:outline-none motion-reduce:transition-none"
          />
          <kbd className="kbd absolute right-4 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">
            ⌘K
          </kbd>
        </form>

        <div className="flex flex-wrap items-center justify-center gap-2">
          {EXAMPLES.map((ex) => {
            const palette = SEMANTIC_COLOR_CLASSES[ex.color];
            return (
              <button
                key={ex.text}
                onClick={() => router.push(`/search?q=${encodeURIComponent(ex.text)}`)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[12.5px] transition-all duration-150 hover:brightness-110 cursor-pointer",
                  palette.soft,
                  palette.text
                )}
              >
                <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", palette.dot)} />
                {ex.text}
              </button>
            );
          })}
        </div>

        {/* Small, integrated workspace context — not decorative filler.
            Only appears once there's real data to show. */}
        {hasHydrated && active.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[12px] text-text-muted">
            <span>{stats?.total ?? active.length} resources</span>
            <span aria-hidden="true">·</span>
            <span>
              {stacks.length} {stacks.length === 1 ? "stack" : "stacks"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{healthyCount} healthy</span>
          </div>
        )}
      </section>

      {/* Library at a glance — a metrics strip, not four repeated card
          boxes: the number carries the weight, the label is secondary,
          and color is used only to echo the meaning already in the
          section it links to (blue → the library, amber → favorites,
          cyan → recently added, violet → stacks), never as the only
          signal (the label text says the same thing either way). */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-3">
        <MetricPill href="/resources" value={stats?.total ?? active.length} label="Resources" color="blue" />
        <MetricPill href="/favorites" value={stats?.favorites ?? favorites.length} label="Favorites" color="warning" />
        <MetricPill href="/recent" value={stats?.addedRecently ?? 0} label="Added recently" color="cyan" />
        <MetricPill href="/stacks" value={stacks.length} label={stacks.length === 1 ? "Stack" : "Stacks"} color="violet" />
      </section>

      {/* Recently added — the OnboardingPanel above already covers the
          empty-library message in full (with real next-step actions), so
          this section only renders once there's actually something to
          show, rather than a second, redundant empty state right below
          it. */}
      {!hasHydrated ? (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Recently Added" href="/recent" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <ResourceCardSkeleton key={i} />
            ))}
          </div>
        </section>
      ) : recentlyAdded.length > 0 ? (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Recently Added" href="/recent" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentlyAdded.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Your stacks */}
      {stacks.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Your Stacks" href="/stacks" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {stacks.slice(0, 8).map((s) => (
              <StackCard key={s.id} stack={s} count={active.filter((r) => r.stackIds.includes(s.id)).length} />
            ))}
          </div>
        </section>
      )}

      {/* Favorites */}
      {favorites.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Favorites" href="/favorites" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {favorites.slice(0, 4).map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </section>
      )}

      {/* Popular tags — a quick filter into the library, not a decorative
          list: clicking one searches the real library by that tag. */}
      {popularTags.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHeader title="Popular Tags" href="/resources" />
          <div className="flex flex-wrap gap-2">
            {popularTags.map((t) => (
              <Tag key={t.id} color={tagColor(t.name)} onClick={() => router.push(`/resources?tag=${t.id}`)}>
                {t.name}
              </Tag>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MetricPill({
  href,
  value,
  label,
  color,
}: {
  href: string;
  value: number;
  label: string;
  color: SemanticColor;
}) {
  const palette = SEMANTIC_COLOR_CLASSES[color];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-2.5 rounded-[var(--radius-md)] border border-transparent px-3.5 py-2.5 transition-all duration-150 hover:border-border",
        palette.soft
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", palette.dot)} />
      <span className={cn("text-[22px] font-semibold leading-none tracking-tight", palette.text)}>{value}</span>
      <span className="text-[12.5px] text-text-secondary transition-colors duration-150 group-hover:text-text-primary">
        {label}
      </span>
    </Link>
  );
}

function SectionHeader({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-text-primary">{title}</h2>
      <Link
        href={href}
        className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary transition-colors duration-150 hover:text-accent"
      >
        View all <ArrowRight size={13} />
      </Link>
    </div>
  );
}
