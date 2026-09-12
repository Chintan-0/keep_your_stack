"use client";

import { useMemo, useState } from "react";
import { Star, Download } from "lucide-react";
import { useStore } from "@/lib/store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";

export default function FavoritesPage() {
  const resources = useStore((s) => s.resources);
  const categories = useStore((s) => s.categories);
  const linkChecks = useStore((s) => s.linkChecks);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, sort: "recent" });
  const [view, setView] = useState<"grid" | "list">("grid");

  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const favorites = useMemo(
    () =>
      applyFiltersAndSort(resources.filter((r) => r.isFavorite && !r.isArchived), filters, categories, linkStatusById),
    [resources, filters, categories, linkStatusById]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <Star size={19} className="text-warning" /> Your Favorites
          </h1>
          <p className="font-mono text-[12.5px] text-text-muted">{favorites.length} resources</p>
        </div>
        {favorites.length > 0 && (
          <a
            href="/api/export/json?scope=favorites"
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-border-strong bg-surface-3 px-2.5 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
          >
            <Download size={13} /> Export
          </a>
        )}
      </div>

      <FilterBar filters={filters} onChange={setFilters} view={view} onViewChange={setView} resultCount={favorites.length} />

      <ResourceCollection
        resources={favorites}
        view={view}
        emptyIcon={Star}
        emptyTitle="Nothing saved here yet."
        emptyDescription="Favorite resources you use often to find them here instantly."
      />
    </div>
  );
}
