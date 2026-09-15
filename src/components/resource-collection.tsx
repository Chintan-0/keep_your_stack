"use client";

import { useState } from "react";
import type { Resource } from "@/lib/types";
import { ResourceCard } from "@/components/resource-card";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import type { LucideIcon } from "lucide-react";
import { PackageOpen } from "lucide-react";

// How many cards render at once, regardless of how many match the current
// filters — a library with thousands of resources must not turn "All
// Resources" into a several-thousand-node DOM. "Show more" reveals another
// batch locally (no network request — it's already-loaded data being
// windowed, separate from the store's own server-side pagination).
const RENDER_BATCH_SIZE = 60;

export function ResourceCollection({
  resources,
  view,
  emptyIcon = PackageOpen,
  emptyTitle = "Nothing here yet.",
  emptyDescription = "Resources you save will show up here.",
  emptyAction,
  showEdit = false,
  selectable = false,
  selectedIds,
  onToggleSelect,
}: {
  resources: Resource[];
  view: "grid" | "list";
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  showEdit?: boolean;
  /** Bulk-select mode — see the "Select" toggle on All Resources. */
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  const hasHydrated = useStore((s) => s.hasHydrated);
  const [visibleCount, setVisibleCount] = useState(RENDER_BATCH_SIZE);
  // Reset the render window when the underlying list changes identity (a
  // new filter/search/sort was applied) — otherwise switching from a
  // narrow filter back to a broad one would stay capped at whatever count
  // an earlier, smaller list had left `visibleCount` at. Adjusting state
  // during render (React's documented pattern for "reset state when a
  // prop changes") rather than in an effect, so this doesn't cost an
  // extra render pass.
  const [prevResources, setPrevResources] = useState(resources);
  if (resources !== prevResources) {
    setPrevResources(resources);
    setVisibleCount(RENDER_BATCH_SIZE);
  }

  if (!hasHydrated) {
    return (
      <div
        className={
          view === "grid"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-2"
        }
      >
        {Array.from({ length: view === "grid" ? 8 : 6 }).map((_, i) => (
          <ResourceCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (resources.length === 0) {
    return (
      <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} action={emptyAction} />
    );
  }

  const visible = resources.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-4">
      <div
        className={
          view === "grid"
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            : "flex flex-col gap-2"
        }
      >
        {visible.map((r) => (
          <ResourceCard
            key={r.id}
            resource={r}
            view={view}
            showEdit={showEdit}
            selectable={selectable}
            selected={selectedIds?.has(r.id)}
            onToggleSelect={() => onToggleSelect?.(r.id)}
          />
        ))}
      </div>
      {visibleCount < resources.length && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + RENDER_BATCH_SIZE)}>
            Show {Math.min(RENDER_BATCH_SIZE, resources.length - visibleCount)} more
          </Button>
        </div>
      )}
    </div>
  );
}
