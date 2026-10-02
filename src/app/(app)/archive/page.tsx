"use client";

import { useMemo, useState } from "react";
import { Archive as ArchiveIcon, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Favicon } from "@/components/ui/favicon";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { categoryName, formatAbsoluteDate, cn } from "@/lib/utils";
import { categoryColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";
import { toast } from "sonner";

const RENDER_BATCH_SIZE = 60;

export default function ArchivePage() {
  const allResources = useStore((s) => s.resources);
  const resources = useMemo(() => allResources.filter((r) => r.isArchived), [allResources]);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const restoreResource = useStore((s) => s.restoreResource);
  const deleteResourcePermanently = useStore((s) => s.deleteResourcePermanently);
  const categories = useStore((s) => s.categories);
  const resourcesHasMore = useStore((s) => s.resourcesHasMore);
  const resourcesLoadingMore = useStore((s) => s.resourcesLoadingMore);
  const loadMoreResources = useStore((s) => s.loadMoreResources);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(RENDER_BATCH_SIZE);
  // Reset the render window when the archived list itself changes —
  // adjusted during render (React's documented pattern), not in an effect.
  const [prevResources, setPrevResources] = useState(resources);
  if (resources !== prevResources) {
    setPrevResources(resources);
    setVisibleCount(RENDER_BATCH_SIZE);
  }
  const visible = resources.slice(0, visibleCount);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <ArchiveIcon size={19} /> Archive
        </h1>
        <p className="font-mono text-[12.5px] text-text-muted">
          {resources.length} archived · hidden from your library but recoverable
        </p>
      </div>

      {!hasHydrated ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      ) : resources.length === 0 ? (
        <EmptyState
          icon={ArchiveIcon}
          title="Nothing archived."
          description="Archived resources stay out of your library without being deleted."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((r) => {
            const category = categories.find((c) => c.id === r.categoryId);
            const accentKey = categoryColor(category?.name || r.domain);
            const accent = SEMANTIC_COLOR_CLASSES[accentKey];
            return (
              <div
                key={r.id}
                className="group relative flex items-center gap-4 overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong"
              >
                {/* A dimmed version of the same category-accent language
                    every other card uses — colorful enough to still feel
                    alive, muted enough to read as "put away," not active. */}
                <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px] opacity-40", accent.dot)} />
                <span className="opacity-60 grayscale-[35%] transition-all duration-150 group-hover:opacity-100 group-hover:grayscale-0">
                  <Favicon seed={r.title} size={32} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[13.5px] font-medium text-text-primary">{r.title}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10.5px]", accent.soft, accent.text)}>
                      {categoryName(r.categoryId, categories)}
                    </span>
                    <span className="text-[11.5px] text-text-muted">
                      archived {formatAbsoluteDate(r.updatedAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    restoreResource(r.id);
                    toast.success(`Restored ${r.title}`);
                  }}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:border-success/40 hover:bg-success-soft hover:text-success cursor-pointer"
                >
                  <RotateCcw size={13} /> Restore
                </button>
                <button
                  onClick={() => setConfirmDeleteId(r.id)}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-danger/30 px-2.5 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger-soft cursor-pointer"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            );
          })}
          {visibleCount < resources.length && (
            <div className="flex justify-center pt-2">
              <Button variant="secondary" size="sm" onClick={() => setVisibleCount((c) => c + RENDER_BATCH_SIZE)}>
                Show {Math.min(RENDER_BATCH_SIZE, resources.length - visibleCount)} more
              </Button>
            </div>
          )}
        </div>
      )}

      {resourcesHasMore && (
        <div className="flex flex-col items-center gap-1.5 border-t border-border pt-4">
          <p className="text-[12px] text-text-muted">
            Only your most recent resources are loaded so far — load more of your library to find older archived items.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void loadMoreResources()} disabled={resourcesLoadingMore}>
            {resourcesLoadingMore ? "Loading…" : "Load more from your library"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) {
            deleteResourcePermanently(confirmDeleteId);
            toast.success("Resource permanently deleted");
          }
        }}
        title="Permanently delete this resource?"
        description="This can't be undone. The resource and your notes will be gone for good."
        confirmLabel="Delete Permanently"
        danger
      />
    </div>
  );
}
