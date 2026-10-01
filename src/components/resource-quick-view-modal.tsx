"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Heart,
  Pencil,
  Archive,
  ArchiveRestore,
  Trash2,
  Copy,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore, getElementBeforeQuickView } from "@/lib/ui-store";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { categoryName, PRICING_LABELS, PLATFORM_LABELS, cn } from "@/lib/utils";
import { categoryColor, tagColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";
import type { Resource } from "@/lib/types";

function track(eventType: string, metadata?: Record<string, unknown>) {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, metadata }),
  }).catch(() => {});
}

// A single, reusable modal for the whole app — mounted once in AppShell,
// driven entirely by useUIStore's quickViewResourceId (§22: one modal
// instance, not one per card). Compact "quick inspection + quick actions,"
// deliberately not the full Resource Detail page squeezed into a dialog —
// that page (src/app/(app)/resources/[id]/page.tsx) still exists for link-
// health checks, enrichment retry, and Related Resources, and stays one
// click away via "Full details" below.
export function ResourceQuickViewModal() {
  const quickViewResourceId = useUIStore((s) => s.quickViewResourceId);
  const close = useUIStore((s) => s.closeQuickView);
  const resource = useStore((s) => s.resources.find((r) => r.id === quickViewResourceId));

  function handleClose() {
    close();
    const toRestore = getElementBeforeQuickView();
    if (toRestore && document.body.contains(toRestore)) {
      setTimeout(() => toRestore.focus(), 0);
    }
  }

  return (
    <Modal open={!!quickViewResourceId} onClose={handleClose} className="max-w-md" labelledBy="quick-view-title">
      {resource && <QuickViewContent resource={resource} onClose={handleClose} />}
    </Modal>
  );
}

function QuickViewContent({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const archiveResource = useStore((s) => s.archiveResource);
  const restoreResource = useStore((s) => s.restoreResource);
  const deleteResourcePermanently = useStore((s) => s.deleteResourcePermanently);
  const openEditResource = useUIStore((s) => s.openEditResource);
  const categories = useStore((s) => s.categories);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);

  // Focus the dialog on mount, then keep Tab/Shift+Tab cycling inside it —
  // the shared Modal primitive handles Escape + backdrop-click already
  // (§16), this just adds the trap+entry-focus this modal specifically
  // needs (§9/§19).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const selector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    (dialog.querySelector<HTMLElement>(selector))?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, []);

  const resourceTags = resource.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean) as { id: string; name: string }[];
  const resourceStacks = resource.stackIds
    .map((id) => stacks.find((s) => s.id === id))
    .filter(Boolean) as typeof stacks;
  const category = resource.categoryId ? categories.find((c) => c.id === resource.categoryId) : null;
  const accent = SEMANTIC_COLOR_CLASSES[categoryColor(category?.name || resource.domain)];

  function openWebsite() {
    track("resource_external_opened", { resourceId: resource.id, label: "quick-view" });
  }

  return (
    <div ref={dialogRef} className="flex flex-col">
      {/* Custom header (not the shared ModalHeader) — needs room for the
          favicon next to the title, matching the Resource Detail page's
          own identity block (§4/§5). */}
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Favicon seed={resource.title} size={36} />
          <div className="min-w-0">
            <h2 id="quick-view-title" className="truncate text-[15px] font-semibold text-text-primary">
              {resource.title}
            </h2>
            <p className="truncate font-mono text-[12px] text-text-muted">{resource.domain}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-text-secondary hover:bg-surface-3 hover:text-text-primary cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto p-5">
        <p className="text-[13.5px] leading-6 text-text-secondary">
          {resource.description || "No description yet."}
        </p>

        {(resource.pricing || (resource.platform && resource.platform.length > 0)) && (
          <div className="flex flex-wrap gap-1.5">
            {resource.pricing && <Tag>{PRICING_LABELS[resource.pricing]}</Tag>}
            {resource.platform?.map((p) => <Tag key={p}>{PLATFORM_LABELS[p]}</Tag>)}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Category</h3>
            <p className={cn("flex items-center gap-1.5 text-[13px]", category ? accent.text : "text-text-muted")}>
              {category && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", accent.dot)} />}
              {categoryName(resource.categoryId, categories)}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Stack</h3>
            {resourceStacks.length > 0 ? (
              <p className="truncate text-[13px] text-text-primary">
                {resourceStacks.map((s) => `${s.icon} ${s.name}`).join(", ")}
              </p>
            ) : (
              <p className="text-[13px] text-text-muted">Not in a stack</p>
            )}
          </div>
        </div>

        {resourceTags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {resourceTags.map((t) => (
                <Tag key={t.id} color={tagColor(t.name)}>
                  {t.name}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {resource.useCases.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-text-muted">Useful For</h3>
            <ul className="flex flex-col gap-1">
              {resource.useCases.slice(0, 3).map((uc, i) => (
                <li key={i} className="text-[13px] text-text-primary">
                  <span className="text-accent">•</span> {uc}
                </li>
              ))}
            </ul>
          </div>
        )}

        {resource.notes && (
          <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-accent/25 bg-accent-soft p-3">
            <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-accent">Your Note</h3>
            <p className="text-[13px] leading-5 text-text-primary">{resource.notes}</p>
          </div>
        )}

        <Link href={`/resources/${resource.id}`} onClick={onClose} className="self-start text-[12px] text-text-muted hover:text-accent">
          Full details →
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleFavorite(resource.id)}
            className={cn(
              "rounded-[var(--radius-sm)] p-2 transition-colors cursor-pointer",
              resource.isFavorite ? "text-warning" : "text-text-muted hover:text-warning"
            )}
            aria-label={resource.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart size={16} fill={resource.isFavorite ? "currentColor" : "none"} />
          </button>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(resource.url);
              toast.success("URL copied");
            }}
            className="rounded-[var(--radius-sm)] p-2 text-text-muted transition-colors hover:text-text-primary cursor-pointer"
            aria-label="Copy URL"
          >
            <Copy size={16} />
          </button>
          {resource.isArchived ? (
            <button
              onClick={() => {
                restoreResource(resource.id);
                toast.success("Restored");
              }}
              className="rounded-[var(--radius-sm)] p-2 text-text-muted transition-colors hover:text-text-primary cursor-pointer"
              aria-label="Restore resource"
            >
              <ArchiveRestore size={16} />
            </button>
          ) : (
            <button
              onClick={() => {
                archiveResource(resource.id);
                toast.success("Archived");
                onClose();
              }}
              className="rounded-[var(--radius-sm)] p-2 text-text-muted transition-colors hover:text-text-primary cursor-pointer"
              aria-label="Archive resource"
            >
              <Archive size={16} />
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            className="rounded-[var(--radius-sm)] p-2 text-text-muted transition-colors hover:text-danger cursor-pointer"
            aria-label="Delete resource"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onClose();
              openEditResource(resource.id);
            }}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border-strong bg-surface-3 px-3 py-2 text-[13px] font-medium text-text-primary transition-colors hover:bg-surface-hover cursor-pointer"
          >
            <Pencil size={14} /> Edit
          </button>
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={openWebsite}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
          >
            Open Website <ArrowUpRight size={14} />
          </a>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteResourcePermanently(resource.id);
          toast.success("Resource deleted");
          onClose();
        }}
        title={`Delete ${resource.title}?`}
        description="This removes the resource and your notes permanently. Consider archiving instead if you might need it later."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
