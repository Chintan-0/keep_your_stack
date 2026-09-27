"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CategorySelector } from "@/components/category-selector";
import { Favicon } from "@/components/ui/favicon";
import { categoryColor, SEMANTIC_COLOR_CLASSES } from "@/lib/colors";
import { cn } from "@/lib/utils";
import type { Resource, Category } from "@/lib/types";

/**
 * A full pan/zoom canvas doesn't work well at 375px — this is the mobile
 * fallback (§34): the same "categories, then their resources" structure as
 * a collapsible list instead of a spatial map. Every action the canvas
 * offers (move, edit, archive) is still available here, just via
 * conventional controls instead of drag/drop.
 */
export function StudioMobileList({
  resources,
  categories,
  onMoveCategory,
  onOpenEdit,
}: {
  resources: Resource[];
  categories: Category[];
  onMoveCategory: (resourceId: string, categoryId: string | null) => void;
  onOpenEdit: (resourceId: string) => void;
}) {
  const groups = useMemo(() => {
    const byCategory = new Map<string, Resource[]>();
    for (const r of resources) {
      const key = r.categoryId ?? "uncategorized";
      if (!byCategory.has(key)) byCategory.set(key, []);
      byCategory.get(key)!.push(r);
    }
    const named = Array.from(byCategory.entries()).map(([key, items]) => ({
      key,
      name: key === "uncategorized" ? "Uncategorized" : categories.find((c) => c.id === key)?.name ?? "Unknown",
      items,
    }));
    return named.sort((a, b) => (a.key === "uncategorized" ? 1 : b.key === "uncategorized" ? -1 : b.items.length - a.items.length));
  }, [resources, categories]);

  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(groups.slice(0, 2).map((g) => g.key)));

  function toggle(key: string) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => {
        const open = openKeys.has(g.key);
        const accent = SEMANTIC_COLOR_CLASSES[categoryColor(g.key === "uncategorized" ? null : g.name)];
        return (
          <div key={g.key} className="rounded-[var(--radius-md)] border border-border bg-surface">
            <button
              onClick={() => toggle(g.key)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left cursor-pointer"
              aria-expanded={open}
            >
              <span className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
                <span className="text-[13.5px] font-semibold text-text-primary">{g.name}</span>
                <span className="rounded-full bg-surface-3 px-1.5 font-mono text-[10.5px] text-text-muted">{g.items.length}</span>
              </span>
              {open ? <ChevronDown size={15} className="text-text-muted" /> : <ChevronRight size={15} className="text-text-muted" />}
            </button>
            {open && (
              <div className="flex flex-col gap-1.5 border-t border-border p-2.5">
                {g.items.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] px-1.5 py-1.5">
                    <Favicon seed={r.title} size={24} />
                    <button onClick={() => onOpenEdit(r.id)} className="min-w-0 flex-1 text-left cursor-pointer">
                      <p className="truncate text-[12.5px] font-medium text-text-primary">{r.title}</p>
                      <p className="truncate font-mono text-[10.5px] text-text-muted">{r.domain}</p>
                    </button>
                    <div className="w-32 shrink-0">
                      <CategorySelector
                        value={r.categoryId}
                        onChange={(id) => onMoveCategory(r.id, id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
