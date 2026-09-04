"use client";

import type { Resource } from "@/lib/types";
import { ResourceCard } from "@/components/resource-card";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useStore } from "@/lib/store";
import type { LucideIcon } from "lucide-react";
import { PackageOpen } from "lucide-react";

export function ResourceCollection({
  resources,
  view,
  emptyIcon = PackageOpen,
  emptyTitle = "Nothing here yet.",
  emptyDescription = "Resources you save will show up here.",
  emptyAction,
  showEdit = false,
}: {
  resources: Resource[];
  view: "grid" | "list";
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  showEdit?: boolean;
}) {
  const hasHydrated = useStore((s) => s.hasHydrated);

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

  return (
    <div
      className={
        view === "grid"
          ? "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          : "flex flex-col gap-2"
      }
    >
      {resources.map((r) => (
        <ResourceCard key={r.id} resource={r} view={view} showEdit={showEdit} />
      ))}
    </div>
  );
}
