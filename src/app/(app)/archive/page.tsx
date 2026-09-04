"use client";

import { useState } from "react";
import { Archive as ArchiveIcon, RotateCcw, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Favicon } from "@/components/ui/favicon";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { categoryName, formatAbsoluteDate } from "@/lib/utils";
import { toast } from "sonner";

export default function ArchivePage() {
  const resources = useStore((s) => s.archivedResources);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const restoreResource = useStore((s) => s.restoreResource);
  const deleteResourcePermanently = useStore((s) => s.deleteResourcePermanently);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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
          {resources.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-4 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3"
            >
              <Favicon seed={r.title} size={32} />
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[13.5px] font-medium text-text-primary">{r.title}</h3>
                <p className="truncate text-[12px] text-text-secondary">
                  {categoryName(r.categoryId)} · archived {formatAbsoluteDate(r.updatedAt)}
                </p>
              </div>
              <button
                onClick={() => {
                  restoreResource(r.id);
                  toast.success(`Restored ${r.title}`);
                }}
                className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border-strong px-2.5 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary cursor-pointer"
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
          ))}
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
