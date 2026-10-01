"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { StackCard } from "@/components/stack-card";
import { OnboardingPanel } from "@/components/onboarding-panel";
import { HeroBanner } from "@/components/home/hero-banner";
import { LibraryStats } from "@/components/home/library-stats";
import { needsReview as isNeedsReview, topLevelCategories, cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

type Scope = "all" | "favorites" | "recent" | "archived";
const SCOPES: { key: Scope; label: string }[] = [
  { key: "all", label: "All Resources" },
  { key: "favorites", label: "Favorites" },
  { key: "recent", label: "Recently Added" },
  { key: "archived", label: "Archived" },
];

export default function DashboardPage() {
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const categories = useStore((s) => s.categories);
  const linkChecks = useStore((s) => s.linkChecks);
  const stats = useStore((s) => s.stats);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const resourcesHasMore = useStore((s) => s.resourcesHasMore);
  const resourcesLoadingMore = useStore((s) => s.resourcesLoadingMore);
  const loadMoreResources = useStore((s) => s.loadMoreResources);

  const [scope, setScope] = useState<Scope>("all");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [view, setView] = useState<"grid" | "list">("grid");

  // `resources` is only the newest loaded page (see store.hydrate), not the
  // whole library — the stat strip uses the dedicated, indexed-count
  // `stats` instead (real totals regardless of pagination), same
  // separation the previous Home dashboard already relied on.
  const active = useMemo(() => resources.filter((r) => !r.isArchived), [resources]);
  const needsReviewCount = active.filter((r) => isNeedsReview(r, linkChecks[r.id]?.status)).length;
  const healthPercent = active.length > 0 ? Math.round(((active.length - needsReviewCount) / active.length) * 100) : null;

  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const scoped = useMemo(() => {
    switch (scope) {
      case "favorites":
        return active.filter((r) => r.isFavorite);
      case "recent":
        return [...active].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      case "archived":
        return resources.filter((r) => r.isArchived);
      default:
        return active;
    }
  }, [scope, active, resources]);

  const filtered = useMemo(
    () => applyFiltersAndSort(scoped, filters, categories, linkStatusById),
    [scoped, filters, categories, linkStatusById]
  );

  return (
    <div className="flex flex-col gap-6">
      <OnboardingPanel />

      <HeroBanner
        totalResources={stats?.total ?? active.length}
        stackCount={stacks.length}
        hasHydrated={hasHydrated}
      />

      <LibraryStats
        totalResources={stats?.total ?? active.length}
        stackCount={stacks.length}
        categoryCount={topLevelCategories(categories).length}
        favoriteCount={stats?.favorites ?? active.filter((r) => r.isFavorite).length}
        healthPercent={healthPercent}
      />

      {stacks.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-semibold text-text-primary">Pinned Stacks</h2>
            <Link
              href="/stacks"
              className="flex items-center gap-1 text-[12.5px] font-medium text-text-secondary transition-colors duration-150 hover:text-accent"
            >
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stacks.slice(0, 5).map((s) => (
              <StackCard
                key={s.id}
                stack={s}
                count={active.filter((r) => r.stackIds.includes(s.id)).length}
                resources={active}
              />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              className={cn(
                "rounded-[var(--radius-sm)] px-3 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer",
                scope === s.key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        <FilterBar filters={filters} onChange={setFilters} view={view} onViewChange={setView} resultCount={filtered.length} />

        <ResourceCollection
          resources={filtered}
          view={view}
          emptyTitle={scope === "archived" ? "Nothing archived." : "Nothing here yet."}
          emptyDescription={
            scope === "favorites"
              ? "Favorite a resource to see it here."
              : scope === "archived"
                ? "Resources you archive will show up here."
                : "Resources you save will show up here."
          }
        />

        {scope === "all" && resourcesHasMore && (
          <div className="flex flex-col items-center gap-1.5 border-t border-border pt-4">
            <p className="text-[12px] text-text-muted">
              Filters only apply to what&apos;s loaded so far — load more of your library to see additional matches.
            </p>
            <button
              onClick={() => void loadMoreResources()}
              disabled={resourcesLoadingMore}
              className="rounded-[var(--radius-md)] border border-border-strong bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50 cursor-pointer"
            >
              {resourcesLoadingMore ? "Loading…" : "Load more from your library"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
