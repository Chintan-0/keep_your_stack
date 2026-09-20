"use client";

import Image from "next/image";
import Link from "next/link";
import { Search, Plus, Menu } from "lucide-react";
import { useUIStore } from "@/lib/ui-store";

export function TopBar({ userEmail, userName }: { userEmail: string; userName: string }) {
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const initial = (userName || userEmail || "?").trim().charAt(0).toUpperCase();

  return (
    <header className="fixed left-0 right-0 top-0 z-30 grid h-14 grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-3 md:hidden cursor-pointer"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <Link href="/home" className="flex items-center gap-2 shrink-0">
          <Image src="/logo-mark.png" alt="" width={28} height={28} className="h-7 w-7 rounded-[7px]" priority />
          <span className="hidden text-[14px] font-semibold tracking-tight text-text-primary sm:block">
            KeepYourStack
          </span>
        </Link>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => setCommandPaletteOpen(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-left text-[13px] text-text-muted transition-colors hover:border-border-strong hover:bg-surface-3 cursor-pointer"
        >
          <Search size={15} />
          <span className="flex-1 truncate">Search your stack…</span>
          <kbd className="kbd hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-text-muted sm:block">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2 justify-self-end">
        {/* The sidebar's "+ Add Resource" is the one dominant primary
            action for this — this stays a small, secondary icon button
            (never filled purple) so the two don't compete, but is still
            reachable from anywhere, including on mobile where the
            sidebar is hidden behind the hamburger menu. */}
        <button
          onClick={() => openAddResource()}
          className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary cursor-pointer"
          aria-label="Add Resource"
          title="Add Resource"
        >
          <Plus size={17} />
        </button>
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet to-accent text-[12px] font-semibold text-white ring-2 ring-transparent transition-all hover:ring-accent/40"
          aria-label="Settings"
          title={userName}
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
