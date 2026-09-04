"use client";

import { LayoutGrid, List, ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { topLevelCategories } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Pricing } from "@/lib/types";
import { categories } from "@/lib/mock-data";

function categoryMatches(categoryId: string | null, filterId: string): boolean {
  if (!categoryId) return false;
  let current = categories.find((c) => c.id === categoryId);
  while (current) {
    if (current.id === filterId) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

export type SortOption = "recent" | "updated" | "name" | "most-used" | "favorites";

export interface Filters {
  categoryId: string;
  stackId: string;
  tagId: string;
  pricing: string;
  sort: SortOption;
}

export const DEFAULT_FILTERS: Filters = {
  categoryId: "",
  stackId: "",
  tagId: "",
  pricing: "",
  sort: "recent",
};

const PRICING_OPTIONS: { value: Pricing | ""; label: string }[] = [
  { value: "", label: "Any pricing" },
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "open-source", label: "Open Source" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Recently Added" },
  { value: "updated", label: "Recently Updated" },
  { value: "name", label: "Name A–Z" },
  { value: "most-used", label: "Most Used" },
  { value: "favorites", label: "Favorites First" },
];

function Select({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-[var(--radius-sm)] border border-border bg-surface-2 py-0 pl-2.5 pr-7 text-[12.5px] text-text-secondary hover:border-border-strong focus:border-accent focus:outline-none"
      >
        {children}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
    </div>
  );
}

export function FilterBar({
  filters,
  onChange,
  view,
  onViewChange,
  resultCount,
  showTagFilter = true,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  view: "grid" | "list";
  onViewChange: (v: "grid" | "list") => void;
  resultCount?: number;
  showTagFilter?: boolean;
}) {
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const categories = topLevelCategories();

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <Select value={filters.categoryId} onChange={(v) => set("categoryId", v)}>
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <Select value={filters.stackId} onChange={(v) => set("stackId", v)}>
        <option value="">All stacks</option>
        {stacks.map((s) => (
          <option key={s.id} value={s.id}>
            {s.icon} {s.name}
          </option>
        ))}
      </Select>

      {showTagFilter && (
        <Select value={filters.tagId} onChange={(v) => set("tagId", v)}>
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              #{t.name}
            </option>
          ))}
        </Select>
      )}

      <Select value={filters.pricing} onChange={(v) => set("pricing", v)}>
        {PRICING_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>

      {(filters.categoryId || filters.stackId || filters.tagId || filters.pricing) && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          className="text-[12px] text-text-muted hover:text-danger cursor-pointer"
        >
          Clear filters
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        {typeof resultCount === "number" && (
          <span className="font-mono text-[11.5px] text-text-muted">{resultCount} results</span>
        )}
        <Select value={filters.sort} onChange={(v) => set("sort", v as SortOption)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <div className="flex items-center rounded-[var(--radius-sm)] border border-border bg-surface-2 p-0.5">
          <button
            onClick={() => onViewChange("grid")}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded-[6px] cursor-pointer",
              view === "grid" ? "bg-surface-hover text-text-primary" : "text-text-muted"
            )}
            aria-label="Grid view"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            onClick={() => onViewChange("list")}
            className={cn(
              "flex h-6 w-7 items-center justify-center rounded-[6px] cursor-pointer",
              view === "list" ? "bg-surface-hover text-text-primary" : "text-text-muted"
            )}
            aria-label="List view"
          >
            <List size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function applyFiltersAndSort<T extends { categoryId: string | null; stackIds: string[]; tagIds: string[]; pricing: string | null; title: string; createdAt: string; updatedAt: string; isFavorite: boolean; useCount: number }>(
  items: T[],
  filters: Filters
): T[] {
  let result = items.filter((r) => {
    if (filters.categoryId && !categoryMatches(r.categoryId, filters.categoryId)) return false;
    if (filters.stackId && !r.stackIds.includes(filters.stackId)) return false;
    if (filters.tagId && !r.tagIds.includes(filters.tagId)) return false;
    if (filters.pricing && r.pricing !== filters.pricing) return false;
    return true;
  });

  switch (filters.sort) {
    case "recent":
      result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "updated":
      result = [...result].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
    case "name":
      result = [...result].sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "most-used":
      result = [...result].sort((a, b) => b.useCount - a.useCount);
      break;
    case "favorites":
      result = [...result].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
      break;
  }
  return result;
}
