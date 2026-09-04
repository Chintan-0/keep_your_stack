"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, ArrowUpRight, Heart } from "lucide-react";
import { useStore } from "@/lib/store";
import { searchResources } from "@/lib/search";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { EmptyState } from "@/components/ui/empty-state";
import { categoryName, cn } from "@/lib/utils";

// Reads the ?q= param straight from the browser location instead of Next's
// useSearchParams — this page is fully client-rendered (all data is local),
// so there's nothing server-side to synchronize and no need for a Suspense
// boundary around it.
function initialQueryFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

export default function SearchPage() {
  const [query, setQuery] = useState(initialQueryFromLocation);
  const storeResources = useStore((s) => s.resources);
  const resources = useMemo(() => storeResources.filter((r) => !r.isArchived), [storeResources]);
  const toggleFavorite = useStore((s) => s.toggleFavorite);

  const results = useMemo(() => searchResources(resources, query), [resources, query]);

  function updateQuery(value: string) {
    setQuery(value);
    const url = value ? `/search?q=${encodeURIComponent(value)}` : "/search";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="relative">
        <SearchIcon size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          placeholder="Search by tool, use case, tag, or note…"
          className="h-12 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-2 pl-11 pr-4 text-[14px] text-text-primary placeholder-text-muted shadow-inner focus:border-accent focus:outline-none"
        />
      </div>

      {!query.trim() ? (
        <p className="text-center text-[13px] text-text-muted">
          Try searching an intent like &ldquo;compress images&rdquo; or &ldquo;test graphql&rdquo;.
        </p>
      ) : results.length === 0 ? (
        <EmptyState
          icon={SearchIcon}
          title="No matches."
          description={`Nothing in your stack matches "${query}" yet.`}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[11.5px] text-text-muted">
            {results.length} result{results.length === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
          </p>
          {results.map(({ resource, matchedOn }) => (
            <div
              key={resource.id}
              className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Favicon seed={resource.title} size={32} />
                  <div>
                    <Link href={`/resources/${resource.id}`} className="text-[14px] font-semibold text-text-primary hover:text-accent">
                      {resource.title}
                    </Link>
                    <p className="text-[12.5px] text-text-secondary">{resource.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => toggleFavorite(resource.id)}
                    className={cn(
                      "rounded-md p-1.5 cursor-pointer",
                      resource.isFavorite ? "text-warning" : "text-text-muted hover:text-warning"
                    )}
                  >
                    <Heart size={15} fill={resource.isFavorite ? "currentColor" : "none"} />
                  </button>
                  <a
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md p-1.5 text-text-muted hover:text-accent cursor-pointer"
                  >
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-11">
                <span className="text-[11px] text-text-muted">Matches:</span>
                {matchedOn.map((m) => (
                  <Tag key={m}>{m}</Tag>
                ))}
                <span className="text-[11px] text-text-muted">· {categoryName(resource.categoryId)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
