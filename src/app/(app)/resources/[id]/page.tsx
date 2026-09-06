"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  Heart,
  ArrowUpRight,
  Pencil,
  Archive,
  Trash2,
  ChevronLeft,
  CheckCircle2,
  MoreHorizontal,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ResourceCard } from "@/components/resource-card";
import { categoryPath, formatAbsoluteDate, PRICING_LABELS, PLATFORM_LABELS, cn } from "@/lib/utils";

export default function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const archiveResource = useStore((s) => s.archiveResource);
  const deleteResourcePermanently = useStore((s) => s.deleteResourcePermanently);
  const openEditResource = useUIStore((s) => s.openEditResource);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const resource = resources.find((r) => r.id === id);

  const related = useMemo(() => {
    if (!resource) return [];
    const scored = resources
      .filter((r) => r.id !== resource.id && !r.isArchived)
      .map((r) => {
        let score = 0;
        if (r.categoryId && r.categoryId === resource.categoryId) score += 3;
        score += r.tagIds.filter((t) => resource.tagIds.includes(t)).length * 2;
        score += r.stackIds.filter((s) => resource.stackIds.includes(s)).length;
        return { r, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.r);
    return scored;
  }, [resource, resources]);

  if (!hasHydrated) {
    return <div className="h-96" />;
  }

  if (!resource) {
    notFound();
  }

  const resourceTags = resource.tagIds
    .map((tagId) => tags.find((t) => t.id === tagId))
    .filter(Boolean) as { id: string; name: string }[];
  const resourceStacks = resource.stackIds
    .map((stackId) => stacks.find((s) => s.id === stackId))
    .filter(Boolean) as typeof stacks;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 pb-16">
      <button
        onClick={() => router.back()}
        className="flex w-fit items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary cursor-pointer"
      >
        <ChevronLeft size={14} /> Back
      </button>

      {/* Header */}
      <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <Favicon seed={resource.title} size={44} />
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">{resource.title}</h1>
              <p className="font-mono text-[12.5px] text-text-muted">{resource.domain}</p>
            </div>
          </div>
          <div className="relative flex items-center gap-1.5">
            <button
              onClick={() => toggleFavorite(resource.id)}
              className={cn(
                "rounded-md p-2 transition-colors cursor-pointer",
                resource.isFavorite ? "text-warning" : "text-text-muted hover:text-warning"
              )}
              aria-label="Toggle favorite"
            >
              <Heart size={18} fill={resource.isFavorite ? "currentColor" : "none"} />
            </button>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md p-2 text-text-muted hover:bg-surface-3 hover:text-text-primary cursor-pointer"
              aria-label="More actions"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-[var(--radius-md)] border border-border-strong bg-surface-2 py-1 shadow-xl">
                <button
                  onClick={() => {
                    openEditResource(resource.id);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
                >
                  <Pencil size={14} /> Edit
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(resource.url);
                    toast.success("URL copied");
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
                >
                  <Copy size={14} /> Copy URL
                </button>
                <button
                  onClick={() => {
                    archiveResource(resource.id);
                    toast.success("Archived");
                    setMenuOpen(false);
                    router.push("/resources");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
                >
                  <Archive size={14} /> Archive
                </button>
                <button
                  onClick={() => {
                    setConfirmDelete(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-danger hover:bg-danger-soft cursor-pointer"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>

        <p className="text-[14.5px] leading-6 text-text-secondary">
          {resource.description || "No description yet — add one from Edit."}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover cursor-pointer"
          >
            Open Resource <ArrowUpRight size={14} />
          </a>
          {resource.pricing && <Tag>{PRICING_LABELS[resource.pricing]}</Tag>}
          {resource.platform?.map((p) => <Tag key={p}>{PLATFORM_LABELS[p]}</Tag>)}
        </div>
      </div>

      {/* Useful for */}
      {resource.useCases.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">Useful For</h2>
          <ul className="flex flex-col gap-2">
            {resource.useCases.map((uc, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-text-primary">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                {uc}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Personal context */}
      {resource.notes && (
        <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-accent/25 bg-accent-soft p-5">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent">Your Note</h2>
          <p className="text-[14.5px] leading-6 text-text-primary">{resource.notes}</p>
        </section>
      )}

      {/* Organization */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">Category</h3>
          <p className="text-[13px] text-text-primary">{categoryPath(resource.categoryId)}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">Tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {resourceTags.length > 0 ? (
              resourceTags.map((t) => (
                <Link key={t.id} href={`/resources?tag=${t.id}`}>
                  <Tag>{t.name}</Tag>
                </Link>
              ))
            ) : (
              <p className="text-[13px] text-text-muted">No tags yet</p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">Stacks</h3>
          <div className="flex flex-wrap gap-1.5">
            {resourceStacks.length > 0 ? (
              resourceStacks.map((s) => (
                <Link
                  key={s.id}
                  href={`/stacks/${s.id}`}
                  className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[12px] text-text-secondary hover:border-border-strong hover:text-text-primary"
                >
                  {s.icon} {s.name}
                </Link>
              ))
            ) : (
              <p className="text-[13px] text-text-muted">Not in a stack</p>
            )}
          </div>
        </div>
      </section>

      <p className="font-mono text-[11.5px] text-text-muted">
        Added {formatAbsoluteDate(resource.createdAt)} · Updated {formatAbsoluteDate(resource.updatedAt)}
      </p>

      {/* Related */}
      {related.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-text-primary">Related Resources</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {related.map((r) => (
              <ResourceCard key={r.id} resource={r} />
            ))}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteResourcePermanently(resource.id);
          toast.success("Resource deleted");
          router.push("/resources");
        }}
        title={`Delete ${resource.title}?`}
        description="This removes the resource and your notes permanently. Consider archiving instead if you might need it later."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
