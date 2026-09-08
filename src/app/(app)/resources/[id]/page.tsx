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
  ChevronRight,
  CheckCircle2,
  MoreHorizontal,
  Copy,
  FolderInput,
  Sparkles,
  Loader2,
  Link2,
  AlertTriangle,
  EyeOff,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { ResourceCard } from "@/components/resource-card";
import { formatAbsoluteDate, formatRelativeDate, PRICING_LABELS, PLATFORM_LABELS, cn } from "@/lib/utils";
import { tokenizeQuery } from "@/lib/search-highlight";

export default function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const categories = useStore((s) => s.categories);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const archiveResource = useStore((s) => s.archiveResource);
  const deleteResourcePermanently = useStore((s) => s.deleteResourcePermanently);
  const updateResource = useStore((s) => s.updateResource);
  const enrichResource = useStore((s) => s.enrichResource);
  const openEditResource = useUIStore((s) => s.openEditResource);
  const linkChecks = useStore((s) => s.linkChecks);
  const checkResourceLink = useStore((s) => s.checkResourceLink);
  const dismissNeedsReview = useStore((s) => s.dismissNeedsReview);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCategoryId, setMoveCategoryId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);

  const resource = resources.find((r) => r.id === id);
  const linkHealth = resource ? linkChecks[resource.id] : undefined;

  const related = useMemo(() => {
    if (!resource) return [];
    // Deterministic signals only (no semantic/AI matching yet) — shared
    // category/tags/stack weigh most, with a light bonus for overlapping
    // title words and Useful For phrasing so near-duplicate-purpose tools
    // (e.g. two API clients) can surface even without a shared tag.
    const titleTokens = new Set(tokenizeQuery(resource.title));
    const usefulForTokens = new Set(resource.useCases.flatMap((uc) => tokenizeQuery(uc)));

    const scored = resources
      .filter((r) => r.id !== resource.id && !r.isArchived)
      .map((r) => {
        let score = 0;
        if (r.categoryId && r.categoryId === resource.categoryId) score += 3;
        score += r.tagIds.filter((t) => resource.tagIds.includes(t)).length * 2;
        score += r.stackIds.filter((s) => resource.stackIds.includes(s)).length;

        const sharedTitleWords = tokenizeQuery(r.title).filter((w) => titleTokens.has(w)).length;
        score += Math.min(sharedTitleWords, 2) * 0.5;

        const sharedUsefulForWords = r.useCases
          .flatMap((uc) => tokenizeQuery(uc))
          .filter((w) => usefulForTokens.has(w)).length;
        score += Math.min(sharedUsefulForWords, 2) * 0.5;

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
                    setMoveCategoryId(resource.categoryId);
                    setMoveOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
                >
                  <FolderInput size={14} /> Move
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
          {resource.description || "No description available."}
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

      {/* Link health */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
        <div className="flex items-center gap-2.5">
          {!linkHealth || linkHealth.status === "unknown" || !linkHealth.checkedAt ? (
            <>
              <Link2 size={15} className="text-text-muted" />
              <p className="text-[13px] text-text-secondary">
                Link not checked yet.
              </p>
            </>
          ) : linkHealth.status === "healthy" ? (
            <>
              <CheckCircle2 size={15} className="text-success" />
              <p className="text-[13px] text-text-secondary">
                Link healthy · Checked {formatRelativeDate(linkHealth.checkedAt)}
              </p>
            </>
          ) : linkHealth.status === "redirected" ? (
            <>
              <AlertTriangle size={15} className="text-warning" />
              <p className="text-[13px] text-text-secondary">
                Redirects to{" "}
                <span className="text-text-primary">{linkHealth.finalUrl ?? "a different address"}</span> · Checked{" "}
                {formatRelativeDate(linkHealth.checkedAt)}
              </p>
            </>
          ) : linkHealth.status === "unavailable" ? (
            <>
              <AlertTriangle size={15} className="text-danger" />
              <p className="text-[13px] text-text-secondary">
                Link unavailable · Checked {formatRelativeDate(linkHealth.checkedAt)}
              </p>
            </>
          ) : linkHealth.status === "blocked" ? (
            <>
              <AlertTriangle size={15} className="text-warning" />
              <p className="text-[13px] text-text-secondary">
                Site blocked our check (may still work in your browser) · Checked{" "}
                {formatRelativeDate(linkHealth.checkedAt)}
              </p>
            </>
          ) : (
            <>
              <Link2 size={15} className="text-text-muted" />
              <p className="text-[13px] text-text-secondary">
                Couldn&apos;t confirm link status · Checked {formatRelativeDate(linkHealth.checkedAt)}
              </p>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {linkHealth?.status === "redirected" && linkHealth.finalUrl && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                updateResource(resource.id, { url: linkHealth.finalUrl! });
                toast.success("URL updated");
              }}
            >
              Update URL
            </Button>
          )}
          {(linkHealth?.status === "unavailable" || linkHealth?.status === "blocked") &&
            !resource.needsReviewDismissed && (
              <Button variant="ghost" size="sm" onClick={() => dismissNeedsReview(resource.id)}>
                <EyeOff size={13} /> Ignore
              </Button>
            )}
          <Button
            variant="secondary"
            size="sm"
            disabled={checkingLink}
            onClick={async () => {
              setCheckingLink(true);
              try {
                await checkResourceLink(resource.id);
                toast.success("Link checked");
              } catch {
                toast.error("Couldn't check this link. Try again.");
              } finally {
                setCheckingLink(false);
              }
            }}
          >
            {checkingLink ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {linkHealth?.checkedAt ? "Recheck" : "Check now"}
          </Button>
        </div>
      </section>

      {/* Enrichment status */}
      {(resource.enrichmentStatus === "pending" ||
        resource.enrichmentStatus === "partial" ||
        resource.enrichmentStatus === "failed") && (
        <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-warning/25 bg-warning/5 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
                <Sparkles size={14} /> This resource needs a little more context
              </h2>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                {resource.enrichmentStatus === "failed"
                  ? "We couldn't get more details from this site."
                  : "We haven't found a description, Useful For, or tags for it yet."}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  try {
                    await enrichResource(resource.id);
                    toast.success("Enrichment updated");
                  } catch {
                    toast.error("Couldn't enrich this resource. Try again.");
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? <Loader2 size={13} className="animate-spin" /> : null} Retry enrichment
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openEditResource(resource.id)}>
                Edit manually
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Useful for */}
      <section className="flex flex-col gap-2.5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-secondary">Useful For</h2>
        {resource.useCases.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {resource.useCases.map((uc, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] text-text-primary">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
                {uc}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-text-muted">What is this useful for?</p>
        )}
      </section>

      {/* Personal context */}
      <section className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-accent/25 bg-accent-soft p-5">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-accent">Your Note</h2>
        <p className="text-[14.5px] leading-6 text-text-primary">
          {resource.notes || <span className="text-text-muted">No note yet.</span>}
        </p>
      </section>

      {/* Organization */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-text-muted">Category</h3>
          {(() => {
            const leaf = resource.categoryId ? categories.find((c) => c.id === resource.categoryId) : null;
            if (!leaf) return <p className="text-[13px] text-text-muted">Uncategorized</p>;
            const parent = leaf.parentId ? categories.find((c) => c.id === leaf.parentId) : null;
            return (
              <p className="flex flex-wrap items-center gap-1 text-[13px]">
                {parent ? (
                  <>
                    <Link href={`/resources?category=${parent.id}`} className="text-text-primary hover:text-accent">
                      {parent.name}
                    </Link>
                    <ChevronRight size={12} className="text-text-muted" />
                    <Link href={`/resources?subcategory=${leaf.id}`} className="text-text-primary hover:text-accent">
                      {leaf.name}
                    </Link>
                  </>
                ) : (
                  <Link href={`/resources?category=${leaf.id}`} className="text-text-primary hover:text-accent">
                    {leaf.name}
                  </Link>
                )}
              </p>
            );
          })()}
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
        {resource.importFolder && (
          <>
            {" "}
            · Imported from {resource.importFolder}
          </>
        )}
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

      <Modal open={moveOpen} onClose={() => setMoveOpen(false)} className="max-w-md" labelledBy="move-resource-title">
        <ModalHeader title="Move Resource" subtitle={resource.title} onClose={() => setMoveOpen(false)} />
        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-text-secondary">Category</label>
            <CategorySelector value={moveCategoryId} onChange={setMoveCategoryId} />
          </div>
          <p className="text-[12px] text-text-muted">
            Stack, tags, note, and Useful For stay exactly as they are — only the category changes.
          </p>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <Button variant="ghost" onClick={() => setMoveOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              updateResource(resource.id, { categoryId: moveCategoryId });
              toast.success("Resource moved");
              setMoveOpen(false);
            }}
          >
            Move Resource
          </Button>
        </div>
      </Modal>
    </div>
  );
}
