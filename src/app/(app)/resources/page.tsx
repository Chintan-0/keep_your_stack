"use client";

import { useMemo, useState } from "react";
import { Search, Package, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";

// This page is fully client-rendered, so the initial ?tag= filter is read
// straight from the browser location rather than Next's useSearchParams
// (which requires a Suspense boundary we don't otherwise need here).
function initialTagFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("tag") ?? "";
}

export default function AllResourcesPage() {
  const initialTag = useState(initialTagFromLocation)[0];
  const resources = useStore((s) => s.resources);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, tagId: initialTag });
  const [view, setView] = useState<"grid" | "list">("grid");

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
    return applyFiltersAndSort(base, filters);
  }, [active, query, filters]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">All Resources</h1>
          <Button size="sm" onClick={() => openAddResource()}>
            <Plus size={14} /> Add Resource
          </Button>
        </div>
        <p className="font-mono text-[12.5px] text-text-muted">{active.length} resources</p>
      </div>

      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by name, domain, or description…"
          className="h-9 w-full max-w-md rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 pl-9 pr-3 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <FilterBar filters={filters} onChange={setFilters} view={view} onViewChange={setView} resultCount={filtered.length} />

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
      />
    </div>
  );
}
