"use client";

import Link from "next/link";
import { Search, Plus, Menu } from "lucide-react";
import { useUIStore } from "@/lib/ui-store";

export function TopBar() {
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  return (
    <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md">
      <button
        onClick={() => setMobileNavOpen(true)}
        className="rounded-md p-1.5 text-text-secondary hover:bg-surface-3 md:hidden cursor-pointer"
        aria-label="Open menu"
      >
        <Menu size={18} />
      </button>

      <Link href="/" className="flex items-center gap-2 shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-gradient-to-br from-accent to-violet text-[13px] font-bold text-white">
          K
        </div>
        <span className="hidden text-[14px] font-semibold tracking-tight text-text-primary sm:block">
          KeepYourStack
        </span>
      </Link>

      <button
        onClick={() => setCommandPaletteOpen(true)}
        className="ml-2 flex h-9 flex-1 max-w-md items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-left text-[13px] text-text-muted transition-colors hover:border-border-strong hover:bg-surface-3 cursor-pointer"
      >
        <Search size={15} />
        <span className="flex-1 truncate">Search your stack…</span>
        <kbd className="kbd hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted sm:block">
          ⌘K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => openAddResource()}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 py-1.5 text-[13px] font-medium text-white shadow-sm shadow-accent/20 transition-colors hover:bg-accent-hover cursor-pointer"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">Add Resource</span>
        </button>
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet to-accent text-[12px] font-semibold text-white ring-2 ring-transparent transition-all hover:ring-accent/40"
          aria-label="Settings"
        >
          M
        </Link>
      </div>
    </header>
  );
}
