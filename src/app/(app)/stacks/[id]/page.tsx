"use client";

import { use, useMemo, useState } from "react";
import { useRouter, notFound } from "next/navigation";
import { ChevronLeft, Settings2, Star, TrendingUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { ManageStackResourcesModal } from "@/components/manage-stack-resources-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

export default function StackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const hasHydrated = useStore((s) => s.hasHydrated);
  const stack = useStore((s) => s.stacks.find((st) => st.id === id));
  const storeResources = useStore((s) => s.resources);
  const allResources = useMemo(() => storeResources.filter((r) => !r.isArchived), [storeResources]);
  const deleteStack = useStore((s) => s.deleteStack);
  const tags = useStore((s) => s.tags);
  const categories = useStore((s) => s.categories);
  const linkChecks = useStore((s) => s.linkChecks);

  const [manageOpen, setManageOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [view, setView] = useState<"grid" | "list">("grid");

  const stackResources = useMemo(
    () => allResources.filter((r) => id && r.stackIds.includes(id)),
    [allResources, id]
  );

  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const filtered = useMemo(() => {
    const base = query.trim()
      ? stackResources.filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
      : stackResources;
    return applyFiltersAndSort(base, filters, categories, linkStatusById);
  }, [stackResources, query, filters, categories, linkStatusById]);

  const favorites = stackResources.filter((r) => r.isFavorite);
  const mostUsed = [...stackResources].sort((a, b) => b.useCount - a.useCount).slice(0, 1)[0];

  const stackTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of stackResources) for (const t of r.tagIds) counts.set(t, (counts.get(t) ?? 0) + 1);
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tid]) => tags.find((t) => t.id === tid))
      .filter(Boolean) as { id: string; name: string }[];
  }, [stackResources, tags]);

  if (!hasHydrated) return <div className="h-96" />;
  if (!stack) notFound();

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => router.push("/stacks")}
        className="flex w-fit items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary cursor-pointer"
      >
        <ChevronLeft size={14} /> Stacks
      </button>

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-surface-3 text-2xl">
              {stack.icon}
            </span>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-text-primary">{stack.name}</h1>
              <p className="font-mono text-[12.5px] text-text-muted">{stackResources.length} resources</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setManageOpen(true)}>
              <Settings2 size={13} /> Manage Resources
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Delete stack">
              <Trash2 size={15} className="text-danger" />
            </Button>
          </div>
        </div>
        <p className="text-[13.5px] text-text-secondary">{stack.description || "No description yet."}</p>

        <div className="flex flex-wrap gap-3 pt-1 text-[12px] text-text-secondary">
          <span className="flex items-center gap-1.5">
            <Star size={13} className="text-warning" /> {favorites.length} favorites
          </span>
          {mostUsed && (
            <span className="flex items-center gap-1.5">
              <TrendingUp size={13} className="text-accent" /> Most used: {mostUsed.title}
            </span>
          )}
        </div>

        {stackTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {stackTags.map((t) => (
              <Tag key={t.id}>{t.name}</Tag>
            ))}
          </div>
        )}
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search within ${stack.name}…`}
          className="h-9 w-full max-w-md rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 px-3 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      <FilterBar
        filters={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
        resultCount={filtered.length}
        showTagFilter={false}
      />

      <ResourceCollection
        resources={filtered}
        view={view}
        emptyTitle="No resources in this stack yet."
        emptyDescription="Add resources you already saved, or save a new one directly into this stack."
        emptyAction={
          <Button size="sm" onClick={() => setManageOpen(true)}>
            <Settings2 size={13} /> Manage Resources
          </Button>
        }
      />

      <ManageStackResourcesModal stackId={stack.id} open={manageOpen} onClose={() => setManageOpen(false)} />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteStack(stack.id);
          toast.success(`Deleted ${stack.name}`);
          router.push("/stacks");
        }}
        title={`Delete ${stack.name}?`}
        description="Resources stay in your library — they'll just no longer belong to this stack."
        confirmLabel="Delete Stack"
        danger
      />
    </div>
  );
}
