"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers,
  Star,
  Clock,
  Archive,
  Upload,
  Puzzle,
  SlidersHorizontal,
  Plus,
  Activity,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { useNow } from "@/lib/use-now";
import { cn, needsReview as isNeedsReview } from "@/lib/utils";

const COLOR_DOT: Record<string, string> = {
  accent: "bg-accent",
  violet: "bg-violet",
  cyan: "bg-cyan",
  success: "bg-success",
  warning: "bg-warning",
};

function NavLink({
  href,
  icon: Icon,
  label,
  count,
  iconClassName,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count?: number;
  iconClassName?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href;
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  return (
    <Link
      href={href}
      onClick={() => setMobileNavOpen(false)}
      className={cn(
        "flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
      )}
    >
      <span className="flex items-center gap-2.5">
        <Icon size={16} className={iconClassName ?? (active ? "text-accent" : "text-text-muted")} />
        {label}
      </span>
      {typeof count === "number" && (
        <span className="font-mono text-[11px] text-text-muted">{count}</span>
      )}
    </Link>
  );
}

export function Sidebar() {
  const resources = useStore((s) => s.resources);
  const stacks = useStore((s) => s.stacks);
  const tags = useStore((s) => s.tags);
  const linkChecks = useStore((s) => s.linkChecks);
  const openAddResource = useUIStore((s) => s.openAddResource);
  const now = useNow();

  const active = resources.filter((r) => !r.isArchived);
  const archivedCount = resources.filter((r) => r.isArchived).length;
  const favoriteCount = active.filter((r) => r.isFavorite).length;
  const recentCount = active.filter((r) => {
    const d = (now - new Date(r.createdAt).getTime()) / 86400000;
    return d <= 14;
  }).length;
  const needsReviewCount = active.filter((r) => isNeedsReview(r, linkChecks[r.id]?.status)).length;

  const popularTagIds = new Map<string, number>();
  for (const r of active) {
    for (const tid of r.tagIds) popularTagIds.set(tid, (popularTagIds.get(tid) ?? 0) + 1);
  }
  const popularTags = Array.from(popularTagIds.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => tags.find((t) => t.id === id))
    .filter(Boolean) as { id: string; name: string }[];

  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  return (
    <>
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed bottom-0 top-14 z-50 flex w-64 flex-col gap-5 overflow-y-auto border-r border-border bg-surface px-3 py-4 transition-transform duration-200 md:z-40 md:w-60 md:translate-x-0",
          mobileNavOpen ? "left-0 translate-x-0" : "left-0 -translate-x-full md:translate-x-0"
        )}
      >
      <button
        onClick={() => openAddResource()}
        className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[13px] font-medium text-white shadow-sm shadow-accent/20 transition-colors hover:bg-accent-hover cursor-pointer"
      >
        <Plus size={15} /> Add Resource
      </button>

      <div className="flex flex-col gap-0.5">
        <NavLink href="/" icon={Home} label="Home" />
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Library</p>
        <NavLink href="/resources" icon={Layers} label="All Resources" count={active.length} />
        <NavLink href="/favorites" icon={Star} label="Favorites" count={favoriteCount} iconClassName="text-warning" />
        <NavLink href="/recent" icon={Clock} label="Recently Added" count={recentCount} iconClassName="text-cyan" />
        <NavLink href="/archive" icon={Archive} label="Archived" count={archivedCount} />
        <NavLink
          href="/library"
          icon={Activity}
          label="Library Health"
          count={needsReviewCount || undefined}
          iconClassName={needsReviewCount > 0 ? "text-warning" : undefined}
        />
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between px-2.5 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Stacks</p>
          <Link href="/stacks" className="text-[11px] text-text-muted hover:text-text-primary">
            View all
          </Link>
        </div>
        {stacks.map((s) => {
          const count = active.filter((r) => r.stackIds.includes(s.id)).length;
          return (
            <Link
              key={s.id}
              href={`/stacks/${s.id}`}
              className="flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-sm leading-none">{s.icon}</span>
                {s.name}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-text-muted">
                <span className={cn("h-1.5 w-1.5 rounded-full", COLOR_DOT[s.color])} />
                {count}
              </span>
            </Link>
          );
        })}
      </div>

      {popularTags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Popular tags</p>
          <div className="flex flex-wrap gap-1.5 px-2.5">
            {popularTags.map((t) => (
              <Link
                key={t.id}
                href={`/resources?tag=${t.id}`}
                className="rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text-secondary hover:border-border-strong hover:text-text-primary"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
        <NavLink href="/import" icon={Upload} label="Import Bookmarks" />
        <NavLink href="/extension" icon={Puzzle} label="Browser Extension" />
        <NavLink href="/settings" icon={SlidersHorizontal} label="Settings" />
      </div>
      </aside>
    </>
  );
}
