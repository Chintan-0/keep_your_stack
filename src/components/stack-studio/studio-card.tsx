"use client";

import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { categoryName } from "@/lib/utils";
import type { Category } from "@/lib/types";

export interface StudioItem {
  id: string; // client-local id (URL-based) until imported, then the real resource id
  title: string;
  url: string;
  domain: string;
  description: string;
  folder: string | null;
  categoryId: string | null;
  stackId: string | null;
  tags: string[];
  confidence: "high" | "medium" | "low" | "none";
  /** Plain-language, always literally true — why the engine suggested this (Part N: "Why this suggestion?"). */
  reasons: string[];
}

/** Compact card for the Stack Studio board — deliberately shows less than the full resource detail (Part K: "do not overload the card"). */
export function StudioCard({
  item,
  categories,
  selected,
  onToggleSelect,
  draggable,
  onDragStart,
  onOpenReview,
}: {
  item: StudioItem;
  categories: Category[];
  selected: boolean;
  onToggleSelect: () => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onOpenReview?: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`flex cursor-pointer flex-col gap-2 rounded-[var(--radius-md)] border p-3 transition-colors ${
        selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
      }`}
      onClick={onToggleSelect}
    >
      <div className="flex items-start gap-2">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} onClick={(e) => e.stopPropagation()} className="mt-1 cursor-pointer" />
        <Favicon seed={item.title} size={24} />
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[13px] font-semibold text-text-primary">{item.title}</h4>
          <p className="truncate font-mono text-[10.5px] text-text-muted">{item.domain}</p>
        </div>
      </div>
      {item.description && <p className="line-clamp-2 text-[12px] leading-4 text-text-secondary">{item.description}</p>}
      {item.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.tags.slice(0, 3).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[10.5px] text-text-muted">
        <span
          className="truncate"
          title={item.reasons.length > 0 ? `Why: ${item.reasons.join("; ")}` : undefined}
        >
          {item.categoryId ? categoryName(item.categoryId, categories) : "Uncategorized"}
        </span>
        {onOpenReview && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenReview();
            }}
            className="shrink-0 text-accent hover:underline cursor-pointer"
          >
            Review
          </button>
        )}
      </div>
    </div>
  );
}
