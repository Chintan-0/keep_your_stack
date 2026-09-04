"use client";

import Link from "next/link";
import { Heart, ArrowUpRight, Pencil } from "lucide-react";
import type { Resource } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { categoryName, cn } from "@/lib/utils";

export function ResourceCard({
  resource,
  view = "grid",
  showEdit = false,
}: {
  resource: Resource;
  view?: "grid" | "list";
  showEdit?: boolean;
}) {
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const openEditResource = useUIStore((s) => s.openEditResource);
  const tags = useStore((s) => s.tags);
  const resourceTags = resource.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter(Boolean)
    .slice(0, 3) as { id: string; name: string }[];

  const stack = useStore((s) => s.stacks.find((st) => resource.stackIds.includes(st.id)));

  if (view === "list") {
    return (
      <div className="group flex items-center gap-4 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 transition-colors hover:border-border-strong hover:bg-surface-2">
        <Favicon seed={resource.title} size={32} />
        <Link href={`/resources/${resource.id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[13.5px] font-medium text-text-primary group-hover:text-accent">
              {resource.title}
            </h3>
            {stack && <span className="text-xs">{stack.icon}</span>}
          </div>
          <p className="truncate text-[12px] text-text-secondary">{resource.description || resource.domain}</p>
        </Link>
        <span className="hidden shrink-0 text-[11px] text-text-muted md:block">{categoryName(resource.categoryId)}</span>
        <div className="hidden shrink-0 gap-1 md:flex">
          {resourceTags.map((t) => (
            <Tag key={t.id}>{t.name}</Tag>
          ))}
        </div>
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
      </div>
    );
  }

  return (
    <div className="group relative flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-all hover:border-border-strong hover:bg-surface-2 hover:shadow-lg hover:shadow-black/20">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Favicon seed={resource.title} size={32} />
          <div className="min-w-0">
            <Link href={`/resources/${resource.id}`}>
              <h3 className="truncate text-[14px] font-semibold text-text-primary group-hover:text-accent">
                {resource.title}
              </h3>
            </Link>
            <p className="truncate font-mono text-[11px] text-text-muted">{resource.domain}</p>
          </div>
        </div>
        <button
          onClick={() => toggleFavorite(resource.id)}
          className={cn(
            "shrink-0 rounded-md p-1 transition-colors cursor-pointer",
            resource.isFavorite ? "text-warning" : "text-text-muted hover:text-warning"
          )}
          aria-label="Toggle favorite"
        >
          <Heart size={16} fill={resource.isFavorite ? "currentColor" : "none"} />
        </button>
      </div>

      <Link href={`/resources/${resource.id}`} className="block">
        <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">
          {resource.description || "No description yet."}
        </p>
      </Link>

      <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
        <span className="truncate">{categoryName(resource.categoryId)}</span>
        {stack && (
          <>
            <span className="text-border-strong">·</span>
            <span className="flex items-center gap-1">
              {stack.icon} {stack.name}
            </span>
          </>
        )}
      </div>

      {resourceTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {resourceTags.map((t) => (
            <Tag key={t.id}>{t.name}</Tag>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between pt-1">
        <Link
          href={`/resources/${resource.id}`}
          className="text-[12px] font-medium text-text-secondary hover:text-text-primary"
        >
          Details
        </Link>
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover cursor-pointer"
        >
          Open <ArrowUpRight size={14} />
        </a>
      </div>
    </div>
  );
}
