"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Package, Plus, CheckSquare, X, Sparkles, Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { runWithConcurrency } from "@/lib/concurrency";
import { cn } from "@/lib/utils";

// This page is fully client-rendered, so the initial ?tag=/?category=/
// ?subcategory=/?needsReview= filters are read from the browser location
// rather than Next's useSearchParams (which requires a Suspense boundary we
// don't otherwise need here).
//
// Reading window.location.search straight into useState's lazy initializer
// would differ between the server render (no window — falls back to "") and
// hydration, which IS the client's first render and DOES see the real URL —
// a real hydration mismatch, not just a theoretical one (confirmed live:
// landing on /resources?needsReview=1, e.g. from the Library Health page's
// link, rendered a different FilterBar button on the server vs. the
// client). So `filters` always starts at DEFAULT_FILTERS on both, and the
// real values are applied once, after mount, in the effect below.
function readLocationFilters(): { tagId: string; categoryId: string; subcategoryId: string; needsReview: boolean } {
  const params = new URLSearchParams(window.location.search);
  return {
    tagId: params.get("tag") ?? "",
    categoryId: params.get("category") ?? "",
    subcategoryId: params.get("subcategory") ?? "",
    needsReview: params.get("needsReview") === "1",
  };
}

export default function AllResourcesPage() {
  const resources = useStore((s) => s.resources);
  const stats = useStore((s) => s.stats);
  const categories = useStore((s) => s.categories);
  const linkChecks = useStore((s) => s.linkChecks);
  const bulkMoveResources = useStore((s) => s.bulkMoveResources);
  const enrichResource = useStore((s) => s.enrichResource);
  const resourcesHasMore = useStore((s) => s.resourcesHasMore);
  const resourcesLoadingMore = useStore((s) => s.resourcesLoadingMore);
  const loadMoreResources = useStore((s) => s.loadMoreResources);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);

  // Justified use of an effect: reading window.location.search can only
  // safely happen post-mount without reintroducing the exact hydration
  // mismatch the fixed initial state above exists to avoid — there's no
  // render-time-derivable alternative here.
  useEffect(() => {
    const fromLocation = readLocationFilters();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilters((prev) => ({ ...prev, ...fromLocation }));
  }, []);

  // A direct link to a subcategory (e.g. from a resource's breadcrumb) only
  // carries that subcategory's id — derive its parent for display so the
  // category dropdown reflects it too, without an effect racing the async
  // category fetch. Once the user changes any filter, FilterBar's onChange
  // passes this resolved value back through and it becomes the real state.
  const displayFilters = useMemo(() => {
    if (filters.categoryId || !filters.subcategoryId) return filters;
    const parentId = categories.find((c) => c.id === filters.subcategoryId)?.parentId;
    return parentId ? { ...filters, categoryId: parentId } : filters;
  }, [filters, categories]);
  const [view, setView] = useState<"grid" | "list">("grid");

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveCategoryId, setMoveCategoryId] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [enriching, setEnriching] = useState<{ done: number; total: number } | null>(null);

  const active = useMemo(() => resources.filter((r) => !r.isArchived), [resources]);
  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const filtered = useMemo(
    () => applyFiltersAndSort(active, filters, categories, linkStatusById),
    [active, filters, categories, linkStatusById]
  );

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelecting(false);
    setSelectedIds(new Set());
    setMoveCategoryId(null);
  }

  async function applyMove() {
    setMoving(true);
    try {
      const moved = await bulkMoveResources(Array.from(selectedIds), moveCategoryId);
      toast.success(`Moved ${moved} resource${moved === 1 ? "" : "s"}`);
      exitSelectMode();
    } catch {
      // store already toasted the error and rolled back optimistic state
    } finally {
      setMoving(false);
    }
  }

  async function applyEnrich() {
    const ids = Array.from(selectedIds);
    setEnriching({ done: 0, total: ids.length });
    let failed = 0;
    await runWithConcurrency(
      ids,
      5,
      async (id) => {
        try {
          const status = await enrichResource(id);
          if (status === "failed") failed++;
        } catch {
          failed++;
        }
      },
      (done, total) => setEnriching({ done, total })
    );
    setEnriching(null);
    toast.success(
      failed > 0
        ? `Enriched ${ids.length - failed} of ${ids.length} — ${failed} couldn't be reached.`
        : `Enriched ${ids.length} resource${ids.length === 1 ? "" : "s"}`
    );
    exitSelectMode();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">All Resources</h1>
          <div className="flex items-center gap-2">
            {!selecting && (
              <Button variant="secondary" size="sm" onClick={() => setSelecting(true)}>
                <CheckSquare size={14} /> Select
              </Button>
            )}
            <Button size="sm" onClick={() => openAddResource()}>
              <Plus size={14} /> Add Resource
            </Button>
          </div>
        </div>
        <p className="font-mono text-[12.5px] text-text-muted">{stats?.total ?? active.length} resources</p>
      </div>

      {selecting && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-4 py-3">
          <span className="text-[13px] font-medium text-text-primary">
            {selectedIds.size} selected
          </span>
          <span className="text-[12px] text-text-secondary">Move to</span>
          <div className="w-56">
            <CategorySelector value={moveCategoryId} onChange={setMoveCategoryId} />
          </div>
          <Button size="sm" onClick={() => void applyMove()} disabled={selectedIds.size === 0 || moving}>
            Move {selectedIds.size || ""} resource{selectedIds.size === 1 ? "" : "s"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void applyEnrich()}
            disabled={selectedIds.size === 0 || !!enriching}
          >
            <Sparkles size={13} />
            {enriching ? `Enriching ${enriching.done}/${enriching.total}` : `Enrich ${selectedIds.size || ""} selected`}
          </Button>
          <a
            href={selectedIds.size > 0 ? `/api/export/json?scope=selected&ids=${Array.from(selectedIds).join(",")}` : undefined}
            aria-disabled={selectedIds.size === 0}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] bg-surface-3 px-2.5 text-[13px] font-medium text-text-primary border border-border-strong transition-colors",
              selectedIds.size === 0 ? "pointer-events-none opacity-50" : "hover:bg-surface-hover cursor-pointer"
            )}
          >
            <Download size={13} /> Export selected
          </a>
          <button
            onClick={exitSelectMode}
            className="ml-auto flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      )}

      {/* Free-text search lives in the global search (⌘K / top bar) now —
          see src/components/command-palette.tsx — rather than a second,
          page-local search box with its own narrower matching. These
          dropdown filters are a different, complementary feature
          (category/stack/tag/pricing/needs-review/sort) and stay. */}
      <FilterBar filters={displayFilters} onChange={setFilters} view={view} onViewChange={setView} resultCount={filtered.length} resultTotal={resourcesHasMore ? stats?.total : undefined} />

      <ResourceCollection
        resources={filtered}
        view={view}
        emptyIcon={Package}
        emptyTitle={
          filters.categoryId || filters.subcategoryId || filters.stackId || filters.tagId || filters.pricing || filters.needsReview
            ? "Nothing matches these filters."
            : "Your toolbox is empty."
        }
        emptyDescription={
          filters.categoryId || filters.subcategoryId || filters.stackId || filters.tagId || filters.pricing || filters.needsReview
            ? "Try clearing one of the filter pills above."
            : "Save a link, import your browser bookmarks, or browse what others are sharing."
        }
        emptyAction={
          filters.categoryId || filters.subcategoryId || filters.stackId || filters.tagId || filters.pricing || filters.needsReview ? undefined : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button onClick={() => openAddResource()} size="sm">
                <Plus size={14} /> Add a resource
              </Button>
              <Link href="/import" className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-border-strong px-3 text-[13px] text-text-primary hover:bg-surface-3">
                Import bookmarks
              </Link>
              <Link href="/discover" className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-border-strong px-3 text-[13px] text-text-primary hover:bg-surface-3">
                Browse Discover
              </Link>
            </div>
          )
        }
        selectable={selecting}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      {resourcesHasMore && (
        <div className="flex flex-col items-center gap-1.5 border-t border-border pt-4">
          <p className="text-[12px] text-text-muted">
            Filters only apply to what&apos;s loaded so far — load more of your library to see additional matches.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void loadMoreResources()} disabled={resourcesLoadingMore}>
            {resourcesLoadingMore ? "Loading…" : "Load more from your library"}
          </Button>
        </div>
      )}
    </div>
  );
}
