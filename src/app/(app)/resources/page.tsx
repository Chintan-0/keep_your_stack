"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Package, Plus, CheckSquare, X, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { runWithConcurrency } from "@/lib/concurrency";

// This page is fully client-rendered, so the initial ?tag= filter is read
// straight from the browser location rather than Next's useSearchParams
// (which requires a Suspense boundary we don't otherwise need here).
function initialTagFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("tag") ?? "";
}

function initialCategoryFiltersFromLocation(): { categoryId: string; subcategoryId: string; needsReview: boolean } {
  if (typeof window === "undefined") return { categoryId: "", subcategoryId: "", needsReview: false };
  const params = new URLSearchParams(window.location.search);
  const subcategoryId = params.get("subcategory") ?? "";
  return {
    categoryId: params.get("category") ?? "",
    subcategoryId,
    needsReview: params.get("needsReview") === "1",
  };
}

export default function AllResourcesPage() {
  const initialTag = useState(initialTagFromLocation)[0];
  const resources = useStore((s) => s.resources);
  const categories = useStore((s) => s.categories);
  const bulkMoveResources = useStore((s) => s.bulkMoveResources);
  const enrichResource = useStore((s) => s.enrichResource);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const initialCategoryFilters = useState(initialCategoryFiltersFromLocation)[0];
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({
    ...DEFAULT_FILTERS,
    tagId: initialTag,
    categoryId: initialCategoryFilters.categoryId,
    subcategoryId: initialCategoryFilters.subcategoryId,
    needsReview: initialCategoryFilters.needsReview,
  });

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

  const filtered = useMemo(() => {
    const base = query.trim()
      ? active.filter((r) => {
          const q = query.toLowerCase();
          return (
            r.title.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q) ||
            r.domain.toLowerCase().includes(q)
          );
        })
      : active;
    return applyFiltersAndSort(base, filters, categories);
  }, [active, query, filters, categories]);

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
        <p className="font-mono text-[12.5px] text-text-muted">{active.length} resources</p>
      </div>

      {selecting ? (
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
          <button
            onClick={exitSelectMode}
            className="ml-auto flex items-center gap-1 text-[12.5px] text-text-muted hover:text-text-primary cursor-pointer"
          >
            <X size={14} /> Cancel
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, domain, or description…"
            className="h-9 w-full max-w-md rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 pl-9 pr-3 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <FilterBar filters={displayFilters} onChange={setFilters} view={view} onViewChange={setView} resultCount={filtered.length} />

      <ResourceCollection
        resources={filtered}
        view={view}
        emptyIcon={Package}
        emptyTitle="Your toolbox is empty."
        emptyDescription="Save your first useful resource."
        emptyAction={
          <Button onClick={() => openAddResource()} size="sm">
            <Plus size={14} /> Add Resource
          </Button>
        }
        selectable={selecting}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />
    </div>
  );
}
