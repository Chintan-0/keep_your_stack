"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Search,
  Plus,
  LayoutGrid,
  Star,
  Clock,
  Layers,
  Settings,
  Upload,
  Archive,
  FolderPlus,
  FolderTree,
  Wand2,
} from "lucide-react";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";
import type { SearchMatch } from "@/lib/types";

// The palette's resource results come from the exact same ranked search
// used on /search (see /api/search + supabase/migrations/
// 20260101000007_search_v2.sql) — one search backend, not two competing
// ones — rather than cmdk's generic built-in fuzzy filter over a flattened
// string. shouldFilter={false} below turns that built-in filter off so
// these results (already ranked) aren't re-sorted by it.
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const openCreateStack = useUIStore((s) => s.openCreateStack);
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMatch[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function handleOpenChange(next: boolean) {
    // Reset synchronously on close (covers every close path — Escape,
    // backdrop click, an action's own setOpen(false) — since they all
    // funnel through here) rather than reacting to `open` in an effect.
    if (!next) {
      setQuery("");
      setResults([]);
    }
    setOpen(next);
  }

  useEffect(() => {
    const trimmed = query.trim();
    // Nothing to search — the palette already shows the quick-actions/
    // navigate groups instead of results whenever the query is empty
    // (see the render below), so there's no state left to reset here.
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled) setResults(body.results ?? []);
      } catch {
        if (!cancelled) setResults([]);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function go(path: string) {
    router.push(path);
    handleOpenChange(false);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={handleOpenChange}
      label="Command palette"
      shouldFilter={false}
      className="fixed left-1/2 top-[14vh] z-[200] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5">
        <Search size={16} className="text-text-muted" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search resources or jump to a page…"
          className="h-12 flex-1 bg-transparent text-[14px] text-text-primary placeholder-text-muted focus:outline-none"
        />
        <kbd className="kbd rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">Esc</kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-[13px] text-text-secondary">
          {query.trim() ? `Nothing found for "${query}".` : "No results found."}
        </Command.Empty>

        {!query.trim() && (
          <>
            <Command.Group heading="Quick actions" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
              <Command.Item
                value="add-resource"
                onSelect={() => {
                  handleOpenChange(false);
                  openAddResource();
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
              >
                <Plus size={15} className="text-accent" /> Add Resource
              </Command.Item>
              <Command.Item
                value="create-stack"
                onSelect={() => {
                  handleOpenChange(false);
                  openCreateStack();
                }}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
              >
                <FolderPlus size={15} className="text-accent" /> Create Stack
              </Command.Item>
              <Command.Item
                value="manage-categories"
                onSelect={() => go("/settings/categories")}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
              >
                <FolderTree size={15} className="text-accent" /> Manage Categories
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Navigate" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
              <Command.Item value="dashboard" onSelect={() => go("/")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <LayoutGrid size={15} className="text-text-secondary" /> Dashboard
              </Command.Item>
              <Command.Item value="all-resources" onSelect={() => go("/resources")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Layers size={15} className="text-text-secondary" /> All Resources
              </Command.Item>
              <Command.Item value="favorites" onSelect={() => go("/favorites")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Star size={15} className="text-text-secondary" /> Favorites
              </Command.Item>
              <Command.Item value="recently-added" onSelect={() => go("/recent")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Clock size={15} className="text-text-secondary" /> Recently Added
              </Command.Item>
              <Command.Item value="stacks" onSelect={() => go("/stacks")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Layers size={15} className="text-text-secondary" /> Stacks
              </Command.Item>
              <Command.Item value="archive" onSelect={() => go("/archive")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Archive size={15} className="text-text-secondary" /> Archive
              </Command.Item>
              <Command.Item value="stack-studio" onSelect={() => go("/stack-studio")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Wand2 size={15} className="text-text-secondary" /> Stack Studio
              </Command.Item>
              <Command.Item value="import-bookmarks" onSelect={() => go("/import")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Upload size={15} className="text-text-secondary" /> Import Bookmarks
              </Command.Item>
              <Command.Item value="settings" onSelect={() => go("/settings")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
                <Settings size={15} className="text-text-secondary" /> Settings
              </Command.Item>
            </Command.Group>
          </>
        )}

        {query.trim() && results.length > 0 && (
          <Command.Group heading="Resources" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
            {results.slice(0, 8).map(({ resource, matchedOn }) => (
              <Command.Item
                key={resource.id}
                value={resource.id}
                onSelect={() => go(`/resources/${resource.id}`)}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
              >
                <Favicon seed={resource.title} size={20} />
                <span className="flex-1 truncate">{resource.title}</span>
                {matchedOn[0] && <span className="shrink-0 text-[11px] text-text-muted">{matchedOn[0]}</span>}
                <span className="truncate font-mono text-[11px] text-text-muted">{resource.domain}</span>
              </Command.Item>
            ))}
            <Command.Item
              value="see-all-results"
              onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[12.5px] text-accent aria-selected:bg-surface-hover"
            >
              <Search size={14} /> See all results for &ldquo;{query.trim()}&rdquo;
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}
