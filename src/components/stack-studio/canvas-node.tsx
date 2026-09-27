"use client";

import { useRef, useState } from "react";
import { ArrowUpRight, Heart, MoreHorizontal, Pencil, Archive } from "lucide-react";
import { Favicon } from "@/components/ui/favicon";
import { CategorySelector } from "@/components/category-selector";
import { categoryColor, tagColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";
import { categoryName, cn } from "@/lib/utils";
import { useDismissableMenu } from "@/lib/use-dismissable-menu";
import { NODE_WIDTH, NODE_HEIGHT } from "@/lib/stack-studio-layout";
import type { Resource, Category, Tag } from "@/lib/types";

/**
 * One resource on the canvas. Kept deliberately light — this is the thing
 * that gets rendered hundreds/thousands of times, so no per-node network
 * calls, no per-node heavy state beyond the tiny "is my own menu open"
 * flag.
 */
export function CanvasNode({
  resource,
  categories,
  tags,
  zoom,
  x,
  y,
  dimmed,
  highlighted,
  draggable,
  onDragStart,
  onDragEnd,
  onOpenEdit,
  onMoveCategory,
  onToggleFavorite,
  onArchive,
}: {
  resource: Resource;
  categories: Category[];
  tags: Tag[];
  zoom: number;
  x: number;
  y: number;
  dimmed: boolean;
  highlighted: boolean;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: (e: React.DragEvent) => void;
  onOpenEdit: () => void;
  onMoveCategory: (categoryId: string | null) => void;
  onToggleFavorite: () => void;
  onArchive: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissableMenu(menuOpen, () => setMenuOpen(false), menuRef);

  const showDetails = zoom >= 0.4;
  const showTags = zoom >= 0.8;
  const category = resource.categoryId ? categories.find((c) => c.id === resource.categoryId) : null;
  const accent = SEMANTIC_COLOR_CLASSES[categoryColor(category?.name || resource.domain)];
  const resourceTags = resource.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean)
    .slice(0, 2) as Tag[];

  if (!showDetails) {
    // Zoomed far out: a plain colored block is both cheaper to render at
    // scale and more legible than illegibly-tiny text (§32/§33).
    return (
      <div
        draggable={draggable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        title={resource.title}
        className={cn(
          "absolute rounded-[6px] transition-opacity duration-150",
          accent.soft,
          dimmed && "opacity-20",
          highlighted && "ring-2 ring-accent"
        )}
        style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
      />
    );
  }

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group absolute flex flex-col gap-1 overflow-visible rounded-[var(--radius-md)] border bg-surface p-2.5 transition-all duration-150",
        "border-border hover:border-border-strong hover:shadow-lg hover:shadow-black/20",
        dimmed && "opacity-25",
        highlighted && "border-accent ring-2 ring-accent/60"
      )}
      style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <span aria-hidden="true" className={cn("absolute inset-x-0 top-0 h-[2px] rounded-t-[var(--radius-md)]", accent.dot)} />
      <div className="flex min-w-0 items-start gap-1.5">
        <Favicon seed={resource.title} size={20} />
        <div className="min-w-0 flex-1">
          <button onClick={onOpenEdit} className="block w-full truncate text-left text-[12px] font-semibold text-text-primary hover:text-accent cursor-pointer">
            {resource.title}
          </button>
          <p className="truncate font-mono text-[10px] text-text-muted">{resource.domain}</p>
        </div>
        <button
          onClick={onToggleFavorite}
          aria-label={resource.isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={cn(
            "shrink-0 rounded p-0.5 transition-opacity",
            resource.isFavorite ? "text-warning opacity-100" : "text-text-muted opacity-0 group-hover:opacity-100"
          )}
        >
          <Heart size={11} fill={resource.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <p className={cn("truncate text-[10px]", accent.text)}>
        {category ? category.name : "Uncategorized"}
      </p>

      {showTags && resourceTags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {resourceTags.map((t) => (
            <span
              key={t.id}
              className={cn("truncate rounded-full px-1.5 py-px text-[9px]", SEMANTIC_COLOR_CLASSES[tagColor(t.name)].soft, SEMANTIC_COLOR_CLASSES[tagColor(t.name)].text)}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between">
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-0.5 text-[10px] font-medium text-accent opacity-0 hover:text-accent-hover group-hover:opacity-100"
        >
          Open <ArrowUpRight size={10} />
        </a>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={`More actions for ${resource.title}`}
            className="rounded p-0.5 text-text-muted opacity-0 hover:bg-surface-3 hover:text-text-primary group-hover:opacity-100 cursor-pointer"
          >
            <MoreHorizontal size={12} />
          </button>
          {menuOpen && (
            <div
              role="menu"
              aria-label="Resource actions"
              className="absolute bottom-full right-0 z-30 mb-1 flex w-52 flex-col gap-2 rounded-[var(--radius-md)] border border-border-strong bg-surface-2 p-2.5 shadow-2xl animate-fade-in"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenEdit();
                }}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[12px] text-text-primary hover:bg-surface-3 cursor-pointer"
              >
                <Pencil size={12} /> Edit
              </button>
              <div className="px-1.5 py-1">
                <p className="mb-1 text-[10.5px] font-medium text-text-muted">Move to category</p>
                <CategorySelector
                  value={resource.categoryId}
                  onChange={(id) => {
                    setMenuOpen(false);
                    onMoveCategory(id);
                  }}
                />
              </div>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onArchive();
                }}
                className="flex w-full items-center gap-2 rounded px-1.5 py-1.5 text-left text-[12px] text-text-primary hover:bg-surface-3 cursor-pointer"
              >
                <Archive size={12} /> Archive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sibling helper — used by the Uncategorized region header and elsewhere. */
export function resourceCategoryLabel(resource: Resource, categories: Category[]): string {
  return resource.categoryId ? categoryName(resource.categoryId, categories) : "Uncategorized";
}
