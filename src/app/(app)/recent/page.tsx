"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useStore } from "@/lib/store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";

export default function RecentPage() {
  const resources = useStore((s) => s.resources);
  const categories = useStore((s) => s.categories);
  const linkChecks = useStore((s) => s.linkChecks);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, sort: "recent" });
  const [view, setView] = useState<"grid" | "list">("list");

  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const recent = useMemo(
    () =>
      applyFiltersAndSort(
        resources.filter((r) => !r.isArchived),
        { ...filters, sort: "recent" },
        categories,
        linkStatusById
      ),
    [resources, filters, categories, linkStatusById]
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Clock size={19} className="text-cyan" /> Recently Added
        </h1>
        <p className="font-mono text-[12.5px] text-text-muted">{recent.length} resources · newest first</p>
      </div>

      <FilterBar filters={filters} onChange={setFilters} view={view} onViewChange={setView} resultCount={recent.length} />

      <ResourceCollection
        resources={recent}
        view={view}
        showEdit
        emptyIcon={Clock}
        emptyTitle="Nothing added recently."
        emptyDescription="New resources you save will appear here first."
      />
    </div>
  );
}
