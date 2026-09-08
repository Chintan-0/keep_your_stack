"use client";

import { LayoutGrid, List, HelpCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { topLevelCategories, childCategories, needsReview as isNeedsReview, cn } from "@/lib/utils";
import type { Category, Pricing } from "@/lib/types";
import { Dropdown, type DropdownOption } from "@/components/ui/dropdown";

function categoryMatches(categoryId: string | null, filterId: string, categories: Category[]): boolean {
  if (!categoryId) return false;
  let current = categories.find((c) => c.id === categoryId);
  while (current) {
    if (current.id === filterId) return true;
    current = current.parentId ? categories.find((c) => c.id === current!.parentId) : undefined;
  }
  return false;
}

export type SortOption = "relevance" | "recent" | "updated" | "name" | "most-used" | "favorites";

export interface Filters {
  categoryId: string;
  subcategoryId: string;
  stackId: string;
  tagId: string;
  pricing: string;
  sort: SortOption;
  needsReview: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  categoryId: "",
  subcategoryId: "",
  stackId: "",
  tagId: "",
  pricing: "",
  sort: "recent",
  needsReview: false,
};

const PRICING_OPTIONS: { value: Pricing | ""; label: string }[] = [
  { value: "", label: "Any pricing" },
  { value: "free", label: "Free" },
  { value: "freemium", label: "Freemium" },
  { value: "paid", label: "Paid" },
  { value: "open-source", label: "Open Source" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "recent", label: "Recently Added" },
  { value: "updated", label: "Recently Updated" },
  { value: "name", label: "Name A–Z" },
  { value: "most-used", label: "Most Used" },
  { value: "favorites", label: "Favorites First" },
];

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: DropdownOption[];
}) {
  return (
    <Dropdown
      value={value}
      onChange={onChange}
      options={options}
      size="sm"
      className="w-auto min-w-0 border-border bg-surface-2 text-text-secondary hover:border-border-strong"
    />
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
  const categories = useStore((s) => s.categories);
  const tops = topLevelCategories(categories);
  const subcats = filters.categoryId ? childCategories(categories, filters.categoryId) : [];

  function set<K extends keyof Filters>(key: K, value: Filters[K]) {
    onChange({ ...filters, [key]: value });
  }

  const hasActiveFilters =
    filters.categoryId || filters.stackId || filters.tagId || filters.pricing || filters.needsReview;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <FilterSelect
        value={filters.categoryId}
        onChange={(v) => onChange({ ...filters, categoryId: v, subcategoryId: "" })}
        options={[
          { value: "", label: "All categories" },
          ...tops.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {subcats.length > 0 && (
        <FilterSelect
          value={filters.subcategoryId}
          onChange={(v) => set("subcategoryId", v)}
          options={[
            { value: "", label: "All subcategories" },
            ...subcats.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      )}

      <FilterSelect
        value={filters.stackId}
        onChange={(v) => set("stackId", v)}
        options={[
          { value: "", label: "All stacks" },
          ...stacks.map((s) => ({ value: s.id, label: `${s.icon} ${s.name}` })),
        ]}
      />

      {showTagFilter && (
        <FilterSelect
          value={filters.tagId}
          onChange={(v) => set("tagId", v)}
          options={[
            { value: "", label: "All tags" },
            ...tags.map((t) => ({ value: t.id, label: `#${t.name}` })),
          ]}
        />
      )}

      <FilterSelect
        value={filters.pricing}
        onChange={(v) => set("pricing", v)}
        options={PRICING_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
      />

      <button
        onClick={() => set("needsReview", !filters.needsReview)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 text-[12.5px] transition-colors cursor-pointer",
          filters.needsReview
            ? "border-warning/40 bg-warning/10 text-warning"
            : "border-border bg-surface-2 text-text-secondary hover:border-border-strong"
        )}
      >
        <HelpCircle size={13} /> Needs Review
      </button>

      {hasActiveFilters && (
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
        <FilterSelect
          value={filters.sort}
          onChange={(v) => set("sort", v as SortOption)}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
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

export function applyFiltersAndSort<
  T extends {
    id: string;
    categoryId: string | null;
    stackIds: string[];
    tagIds: string[];
    pricing: string | null;
    title: string;
    createdAt: string;
    updatedAt: string;
    isFavorite: boolean;
    useCount: number;
    useCases: string[];
    needsReviewDismissed: boolean;
  },
>(items: T[], filters: Filters, categories: Category[], linkStatusById?: Map<string, string>): T[] {
  let result = items.filter((r) => {
    if (filters.subcategoryId) {
      if (r.categoryId !== filters.subcategoryId) return false;
    } else if (filters.categoryId && !categoryMatches(r.categoryId, filters.categoryId, categories)) {
      return false;
    }
    if (filters.stackId && !r.stackIds.includes(filters.stackId)) return false;
    if (filters.tagId && !r.tagIds.includes(filters.tagId)) return false;
    if (filters.pricing && r.pricing !== filters.pricing) return false;
    if (filters.needsReview) {
      const linkStatus = linkStatusById?.get(r.id) as Parameters<typeof isNeedsReview>[1];
      if (!isNeedsReview(r, linkStatus)) return false;
    }
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
