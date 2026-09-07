"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { useStore } from "@/lib/store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";

export default function FavoritesPage() {
  const resources = useStore((s) => s.resources);
  const categories = useStore((s) => s.categories);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, sort: "recent" });
  const [view, setView] = useState<"grid" | "list">("grid");

  const favorites = useMemo(
    () => applyFiltersAndSort(resources.filter((r) => r.isFavorite && !r.isArchived), filters, categories),
    [resources, filters, categories]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Star size={19} className="text-warning" /> Your Favorites
        </h1>
        <p className="font-mono text-[12.5px] text-text-muted">{favorites.length} resources</p>
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
