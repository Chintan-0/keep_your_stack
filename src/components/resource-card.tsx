"use client";

import Link from "next/link";
import { Heart, ArrowUpRight, Pencil, Check } from "lucide-react";
import type { Resource } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { categoryName, cn } from "@/lib/utils";
import { categoryColor, tagColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";

export function ResourceCard({
  resource,
  view = "grid",
  showEdit = false,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  resource: Resource;
  view?: "grid" | "list";
  showEdit?: boolean;
  /** Bulk-select mode (All Resources toolbar) — shows a checkbox and disables normal navigation. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const openEditResource = useUIStore((s) => s.openEditResource);
  const tags = useStore((s) => s.tags);
  const categories = useStore((s) => s.categories);
  const resourceTags = resource.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean)
    .slice(0, 3) as { id: string; name: string }[];

  const stack = useStore((s) => s.stacks.find((st) => resource.stackIds.includes(st.id)));
  const category = categories.find((c) => c.id === resource.categoryId);
  // A category always has a deterministic accent (falls back to a hashed
  // one when the name doesn't match a known keyword — see
  // src/lib/colors.ts). For a resource with no category yet, hash on its
  // domain instead of falling back to one fixed color for every
  // uncategorized card — still fully deterministic (same domain, same
  // color, every time) but keeps a library that's mostly uncategorized
  // (e.g. a fresh bulk import, before anyone's sorted it) from rendering
  // as a wall of identical accents.
  const accentColorKey = categoryColor(category?.name || resource.domain);
  const accent = SEMANTIC_COLOR_CLASSES[accentColorKey];

  const Checkbox = selectable ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect?.();
      }}
      aria-label={selected ? "Deselect" : "Select"}
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors cursor-pointer",
        selected ? "border-accent bg-accent text-white" : "border-border-strong bg-surface-2 text-transparent"
      )}
    >
      <Check size={12} />
    </button>
  ) : null;

  if (view === "list") {
    return (
      <div
        onClick={selectable ? onToggleSelect : undefined}
        className={cn(
          "group flex items-center gap-4 rounded-[var(--radius-md)] border bg-surface px-4 py-3 transition-colors",
          selectable
            ? cn("cursor-pointer", selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")
            : "border-border hover:border-border-strong hover:bg-surface-2"
        )}
      >
        {Checkbox}
        <Favicon seed={resource.title} size={32} />
        {selectable ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13.5px] font-medium text-text-primary">{resource.title}</h3>
              {stack && <span className="text-xs">{stack.icon}</span>}
            </div>
            <p className="truncate text-[12px] text-text-secondary">{resource.description || resource.domain}</p>
          </div>
        ) : (
          <Link href={`/resources/${resource.id}`} className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13.5px] font-medium text-text-primary group-hover:text-accent">
                {resource.title}
              </h3>
              {stack && <span className="text-xs">{stack.icon}</span>}
            </div>
            <p className="truncate text-[12px] text-text-secondary">{resource.description || resource.domain}</p>
          </Link>
        )}
        <span className="hidden shrink-0 text-[11px] text-text-muted md:block">{categoryName(resource.categoryId, categories)}</span>
        <div className="hidden shrink-0 gap-1 md:flex">
          {resourceTags.map((t) => (
            <Tag key={t.id} color={tagColor(t.name)}>
              {t.name}
            </Tag>
          ))}
        </div>
        {!selectable && (
          <>
            <button
              onClick={() => toggleFavorite(resource.id)}
              className={cn(
                "shrink-0 rounded-md p-1.5 transition-colors cursor-pointer",
                resource.isFavorite ? "text-warning" : "text-text-muted hover:text-warning"
              )}
              aria-label="Toggle favorite"
            >
              <Heart size={16} fill={resource.isFavorite ? "currentColor" : "none"} />
            </button>
            {showEdit && (
              <button
                onClick={() => openEditResource(resource.id)}
                className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:text-text-primary cursor-pointer"
                aria-label="Edit resource"
              >
                <Pencil size={15} />
              </button>
            )}
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md p-1.5 text-text-muted transition-colors hover:text-accent cursor-pointer"
              aria-label="Open resource"
            >
              <ArrowUpRight size={16} />
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={selectable ? onToggleSelect : undefined}
      className={cn(
        "group relative flex flex-col gap-3 overflow-hidden rounded-[var(--radius-lg)] border bg-surface p-4 pt-[14px] transition-all duration-200 motion-reduce:transition-colors",
        selectable
          ? cn("cursor-pointer", selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong")
          : "border-border hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-2 hover:shadow-lg hover:shadow-black/20 motion-reduce:hover:translate-y-0"
      )}
    >
      {/* A thin category-colored accent line — the card's one deliberate
          spot of color, not a full colored background (§5). */}
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[3px]", accent.dot)} />

      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {Checkbox}
          <span
            className="relative flex shrink-0 items-center justify-center rounded-[10px]"
            style={{ boxShadow: selectable ? undefined : `0 0 16px -2px var(--${accentColorKey})` }}
          >
            <Favicon seed={resource.title} size={32} />
          </span>
          <div className="min-w-0">
            {selectable ? (
              <h3 className="truncate text-[14px] font-semibold text-text-primary">{resource.title}</h3>
            ) : (
              <Link href={`/resources/${resource.id}`}>
                <h3 className="truncate text-[14px] font-semibold text-text-primary group-hover:text-accent">
                  {resource.title}
                </h3>
              </Link>
            )}
            <p className="truncate font-mono text-[11px] text-text-muted">{resource.domain}</p>
          </div>
        </div>
        {!selectable && (
          <button
            onClick={() => toggleFavorite(resource.id)}
            className={cn(
              "shrink-0 rounded-md p-1 transition-all duration-150 cursor-pointer motion-reduce:transition-none",
              resource.isFavorite
                ? "text-warning opacity-100"
                : "text-text-muted opacity-40 hover:text-warning hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
            )}
            aria-label={resource.isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart size={16} fill={resource.isFavorite ? "currentColor" : "none"} className="transition-transform duration-150 active:scale-90 motion-reduce:transition-none" />
          </button>
        )}
      </div>

      {selectable ? (
        <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">
          {resource.description || "No description yet."}
        </p>
      ) : (
        <Link href={`/resources/${resource.id}`} className="block">
          <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">
            {resource.description || "No description yet."}
          </p>
        </Link>
      )}

      {resource.useCases.length > 0 && (
        <p className="line-clamp-1 text-[12px] text-text-secondary">
          <span className="text-text-muted">Useful for </span>
          {resource.useCases[0]}
        </p>
      )}

      {resourceTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resourceTags.map((t) => (
            <Tag key={t.id} color={tagColor(t.name)}>
              {t.name}
            </Tag>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-1">
        <span className={cn("truncate text-[11px]", stack ? "text-text-muted" : accent.text)}>
          {stack ? (
            <span className="flex items-center gap-1">
              {stack.icon} {stack.name}
            </span>
          ) : (
            categoryName(resource.categoryId, categories)
          )}
        </span>
        {!selectable && (
          <a
            href={resource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover cursor-pointer"
          >
            Open <ArrowUpRight size={14} />
          </a>
        )}
      </div>
    </div>
  );
}
