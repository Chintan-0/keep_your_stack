"use client";

import { useEffect, useMemo } from "react";
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
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { Favicon } from "@/components/ui/favicon";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const openCreateStack = useUIStore((s) => s.openCreateStack);
  const router = useRouter();
  const allResources = useStore((s) => s.resources);
  const resources = useMemo(() => allResources.filter((r) => !r.isArchived), [allResources]);

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

  function go(path: string) {
    router.push(path);
    setOpen(false);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed left-1/2 top-[14vh] z-[200] w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 shadow-2xl"
    >
      <div className="flex items-center gap-2 border-b border-border px-3.5">
        <Search size={16} className="text-text-muted" />
        <Command.Input
          autoFocus
          placeholder="Search resources or jump to a page…"
          className="h-12 flex-1 bg-transparent text-[14px] text-text-primary placeholder-text-muted focus:outline-none"
        />
        <kbd className="kbd rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted">Esc</kbd>
      </div>
      <Command.List className="max-h-[60vh] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-[13px] text-text-secondary">
          No results found.
        </Command.Empty>

        <Command.Group heading="Quick actions" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
          <Command.Item
            onSelect={() => {
              setOpen(false);
              openAddResource();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
          >
            <Plus size={15} className="text-accent" /> Add Resource
          </Command.Item>
          <Command.Item
            onSelect={() => {
              setOpen(false);
              openCreateStack();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
          >
            <FolderPlus size={15} className="text-accent" /> Create Stack
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Navigate" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
          <Command.Item onSelect={() => go("/")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <LayoutGrid size={15} className="text-text-secondary" /> Dashboard
          </Command.Item>
          <Command.Item onSelect={() => go("/resources")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Layers size={15} className="text-text-secondary" /> All Resources
          </Command.Item>
          <Command.Item onSelect={() => go("/favorites")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Star size={15} className="text-text-secondary" /> Favorites
          </Command.Item>
          <Command.Item onSelect={() => go("/recent")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Clock size={15} className="text-text-secondary" /> Recently Added
          </Command.Item>
          <Command.Item onSelect={() => go("/stacks")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Layers size={15} className="text-text-secondary" /> Stacks
          </Command.Item>
          <Command.Item onSelect={() => go("/archive")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Archive size={15} className="text-text-secondary" /> Archive
          </Command.Item>
          <Command.Item onSelect={() => go("/import")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Upload size={15} className="text-text-secondary" /> Import Bookmarks
          </Command.Item>
          <Command.Item onSelect={() => go("/settings")} className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover">
            <Settings size={15} className="text-text-secondary" /> Settings
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Resources" className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted [&_[cmdk-group-heading]]:pb-1.5">
          {resources.map((r) => (
            <Command.Item
              key={r.id}
              value={`${r.title} ${r.domain} ${r.description} ${r.notes}`}
              onSelect={() => go(`/resources/${r.id}`)}
              className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-[13px] text-text-primary aria-selected:bg-surface-hover"
            >
              <Favicon seed={r.title} size={20} />
              <span className="flex-1 truncate">{r.title}</span>
              <span className="truncate font-mono text-[11px] text-text-muted">{r.domain}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
