"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search as SearchIcon, ArrowUpRight, Heart, X, Clock, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import type { SearchMatch } from "@/lib/types";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { ResourceCollection } from "@/components/resource-collection";
import { FilterBar, DEFAULT_FILTERS, applyFiltersAndSort, type Filters } from "@/components/filter-bar";
import { categoryName, cn } from "@/lib/utils";
import { tokenizeQuery, highlightSegments } from "@/lib/search-highlight";
import { markSearchPerformed } from "@/components/onboarding-panel";

const EXAMPLES = ["compress images", "test graphql", "react components", "svg to react"];
const RECENT_SEARCHES_KEY = "kys_recent_searches";
const MAX_RECENT_SEARCHES = 8;

function initialQueryFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeRecentSearches(searches: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, MAX_RECENT_SEARCHES)));
  } catch {
    // Private browsing / storage disabled — recent searches just won't persist. Not worth surfacing an error for.
  }
}

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  if (!text) return null;
  const segments = highlightSegments(text, tokens);
  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-[2px] bg-accent/25 text-text-primary">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

export default function SearchPage() {
  // Deliberately starts empty on every render, server or client — reading
  // ?q= into state immediately (even guarded to "" during SSR) still
  // mismatches, because hydration itself is the client's first render:
  // the initializer would already see the real URL then, while the
  // server-emitted HTML was built with "". Setting it from ?q= happens
  // once, after mount, in the effect below instead.
  const [query, setQuery] = useState("");
  const toggleFavorite = useStore((s) => s.toggleFavorite);
  const categories = useStore((s) => s.categories);
  const allResources = useStore((s) => s.resources);
  const hasHydrated = useStore((s) => s.hasHydrated);
  const linkChecks = useStore((s) => s.linkChecks);

  const [results, setResults] = useState<SearchMatch[]>([]);
  const [didYouMean, setDidYouMean] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, sort: "relevance" });
  const [view, setView] = useState<"grid" | "list">("list");
  // Starts empty on both server and client for the same hydration reason
  // as `query` above — populated from the URL/localStorage once, after
  // mount, in the effect below.
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tokens = useMemo(() => tokenizeQuery(query), [query]);

  // Reads real browser-only state (the URL's ?q= and localStorage) exactly
  // once, right after the hydration-safe empty-state render above commits —
  // the one legitimate use of an effect here (synchronizing from an
  // external source on mount), not something derivable during render.
  // Justified use of an effect: reading window.location.search /
  // localStorage can only safely happen post-mount without reintroducing
  // the exact hydration mismatch the empty initial state above exists to
  // avoid — there's no render-time-derivable alternative here.
  useEffect(() => {
    const initialQuery = initialQueryFromLocation();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) setQuery(initialQuery);
    setRecentSearches(readRecentSearches());
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to search — the render below already switches to the
    // discovery view whenever the query is empty, so stale results/
    // suggestions here are simply never rendered; no state to reset.
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!cancelled) {
          setResults(body.results);
          setDidYouMean(body.didYouMean ?? []);
          setError(null);
          markSearchPerformed();
        }
      } catch {
        if (!cancelled) {
          setError("Search is temporarily unavailable.");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200); // debounce so every keystroke doesn't round-trip

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function updateQuery(value: string) {
    setQuery(value);
    const url = value ? `/search?q=${encodeURIComponent(value)}` : "/search";
    window.history.replaceState(null, "", url);
    setSuggestOpen(!!value.trim());
  }

  function commitSearch(value: string) {
    updateQuery(value);
    setSuggestOpen(false);
    const trimmed = value.trim();
    if (!trimmed) return;
    setRecentSearches((prev) => {
      const next = [trimmed, ...prev.filter((s) => s.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      );
      writeRecentSearches(next);
      return next;
    });
  }

  // Library-real suggestions only — resource titles, tag names, category/
  // stack names the user actually has. Never generic placeholder text.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return [];
    const titles = allResources
      .filter((r) => !r.isArchived && r.title.toLowerCase().includes(q))
      .slice(0, 5)
      .map((r) => ({ type: "resource" as const, label: r.title, id: r.id }));
    const tagNames = useStore
      .getState()
      .tags.filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 3)
      .map((t) => ({ type: "tag" as const, label: t.name }));
    return [...titles, ...tagNames].slice(0, 6);
  }, [query, allResources]);

  const linkStatusById = useMemo(
    () => new Map(Object.entries(linkChecks).map(([id, health]) => [id, health.status])),
    [linkChecks]
  );

  const filteredResults = useMemo(() => {
    const asResources = results.map((r) => r.resource);
    const filtered = applyFiltersAndSort(asResources, filters, categories, linkStatusById);
    const byId = new Map(results.map((r) => [r.resource.id, r]));
    return filtered.map((r) => byId.get(r.id)!).filter(Boolean);
  }, [results, filters, categories, linkStatusById]);

  const active = useMemo(() => allResources.filter((r) => !r.isArchived), [allResources]);
  const favorites = useMemo(() => active.filter((r) => r.isFavorite).slice(0, 4), [active]);
  const recentlyAdded = useMemo(
    () => [...active].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 4),
    [active]
  );

  const hasQuery = !!query.trim();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="relative">
        <SearchIcon size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => updateQuery(e.target.value)}
          onFocus={() => setSuggestOpen(!!query.trim())}
          onBlur={() => setTimeout(() => setSuggestOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSearch(query);
            if (e.key === "Escape") setSuggestOpen(false);
          }}
          placeholder="Search your stack…"
          className="h-12 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-2 pl-11 pr-10 text-[14px] text-text-primary placeholder-text-muted shadow-inner focus:border-accent focus:outline-none"
        />
        {query && (
          <button
            onClick={() => updateQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}

        {suggestOpen && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-[var(--radius-md)] border border-border-strong bg-surface-2 py-1 shadow-2xl">
            {suggestions.map((s, i) => (
              <button
                key={`${s.type}-${i}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitSearch(s.label)}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
              >
                {s.type === "resource" ? (
                  <SearchIcon size={13} className="shrink-0 text-text-muted" />
                ) : (
                  <span className="shrink-0 font-mono text-[11px] text-text-muted">#</span>
                )}
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!hasQuery ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => commitSearch(ex)}
                className="rounded-full border border-border bg-surface-2 px-3 py-1 text-[12px] text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary cursor-pointer"
              >
                {ex}
              </button>
            ))}
          </div>

          {recentSearches.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  <Clock size={12} /> Recent
                </p>
                <button
                  onClick={() => {
                    setRecentSearches([]);
                    writeRecentSearches([]);
                  }}
                  className="text-[11px] text-text-muted hover:text-danger cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((s) => (
                  <span
                    key={s}
                    className="group flex items-center gap-1 rounded-full border border-border bg-surface-2 py-1 pl-3 pr-1.5 text-[12px] text-text-secondary hover:border-border-strong"
                  >
                    <button onClick={() => commitSearch(s)} className="cursor-pointer hover:text-text-primary">
                      {s}
                    </button>
                    <button
                      onClick={() => {
                        const next = recentSearches.filter((r) => r !== s);
                        setRecentSearches(next);
                        writeRecentSearches(next);
                      }}
                      className="rounded-full p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger cursor-pointer"
                      aria-label={`Remove "${s}"`}
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {favorites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Favorites</p>
              <ResourceCollection resources={favorites} view="list" />
            </div>
          )}

          {recentlyAdded.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Recently Added</p>
              <ResourceCollection resources={recentlyAdded} view="list" />
            </div>
          )}

          {!hasHydrated ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <ResourceCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            active.length === 0 && (
              <p className="text-center text-[13px] text-text-muted">
                Save something first, then come back here to find it again.
              </p>
            )
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            view={view}
            onViewChange={setView}
            resultCount={filteredResults.length}
          />

          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <ResourceCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <EmptyState icon={SearchIcon} title="Search is temporarily unavailable." description="Try again in a moment." />
          ) : filteredResults.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-10 text-center">
              <SearchIcon size={22} className="text-text-muted" />
              <div>
                <p className="text-[14px] font-medium text-text-primary">Nothing matched &ldquo;{query}&rdquo;.</p>
                {results.length > 0 ? (
                  <p className="mt-1 text-[12.5px] text-text-secondary">Your filters excluded every match — try clearing them.</p>
                ) : (
                  <div className="mt-2 max-w-xs text-[12.5px] text-text-secondary">
                    <p>Try:</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-text-muted">
                      <li>· another phrase</li>
                      <li>· a tag</li>
                      <li>· a category</li>
                      <li>· what the tool <em>does</em>, not its name</li>
                    </ul>
                    <p className="mt-2 font-mono text-[11.5px] text-text-muted">
                      instead of &ldquo;Hoppscotch&rdquo; try &ldquo;test APIs&rdquo;
                    </p>
                  </div>
                )}
              </div>
              {didYouMean.length > 0 && (
                <div className="flex flex-col items-center gap-1.5">
                  <p className="text-[12px] text-text-muted">Did you mean:</p>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {didYouMean.map((term) => (
                      <button
                        key={term}
                        onClick={() => commitSearch(term)}
                        className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1 text-[12.5px] text-accent hover:bg-accent/20 cursor-pointer"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(filters.categoryId || filters.stackId || filters.tagId || filters.needsReview) && (
                <button
                  onClick={() => setFilters({ ...DEFAULT_FILTERS, sort: "relevance" })}
                  className="text-[12.5px] text-accent hover:text-accent-hover cursor-pointer"
                >
                  Clear filters and search all resources
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredResults.map(({ resource, matchedOn }) => (
                <div
                  key={resource.id}
                  className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Favicon seed={resource.title} size={32} />
                      <div className="min-w-0">
                        <Link href={`/resources/${resource.id}`} className="text-[14px] font-semibold text-text-primary hover:text-accent">
                          <Highlight text={resource.title} tokens={tokens} />
                        </Link>
                        <p className="text-[12.5px] text-text-secondary">
                          <Highlight text={resource.description} tokens={tokens} />
                        </p>
                        {resource.useCases.length > 0 && (
                          <p className="mt-0.5 text-[12px] text-text-secondary">
                            <span className="text-text-muted">Useful for </span>
                            <Highlight text={resource.useCases[0]} tokens={tokens} />
                          </p>
                        )}
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
                  {resource.tagIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-11">
                      {resource.tagIds.slice(0, 4).map((tid) => {
                        const t = useStore.getState().tags.find((tag) => tag.id === tid);
                        return t ? (
                          <Tag key={tid}>
                            <Highlight text={t.name} tokens={tokens} />
                          </Tag>
                        ) : null;
                      })}
                    </div>
                  )}
                  {matchedOn.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pl-11">
                      <span className="flex items-center gap-1 text-[11px] text-text-muted">
                        <Sparkles size={11} /> Why it matched:
                      </span>
                      <span className="text-[11px] text-text-secondary">{matchedOn.join(" · ")}</span>
                      <span className="text-[11px] text-text-muted">· {categoryName(resource.categoryId, categories)}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
