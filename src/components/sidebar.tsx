"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Layers,
  Star,
  Clock,
  Archive,
  Inbox,
  Compass,
  Upload,
  Puzzle,
  SlidersHorizontal,
  Plus,
  Activity,
  Shield,
  Wand2,
  MessageSquare,
  FolderPlus,
  FolderTree,
  Flame,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { useNow } from "@/lib/use-now";
import { Favicon } from "@/components/ui/favicon";
import { cn, needsReview as isNeedsReview, formatRelativeDate } from "@/lib/utils";
import { SEMANTIC_COLOR_CLASSES, tagColor } from "@/lib/colors";

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

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
        "group relative flex items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] transition-colors",
        active
          ? "bg-accent-soft font-medium text-accent"
          : "text-text-secondary hover:bg-surface-3 hover:text-text-primary"
      )}
    >
      {active && (
        <span aria-hidden="true" className="animate-nav-in absolute inset-y-1.5 left-0 w-[2.5px] rounded-full bg-accent" />
      )}
      <span className="flex items-center gap-2.5">
        <Icon
          size={16}
          className={cn(
            "transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:group-hover:scale-100",
            iconClassName ?? (active ? "text-accent" : "text-text-muted")
          )}
        />
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
  const openCreateStack = useUIStore((s) => s.openCreateStack);
  const openFeedback = useUIStore((s) => s.openFeedback);
  const now = useNow();

  // Purely a UX nicety — hiding/showing this link is NOT the security
  // boundary. /admin and every /api/admin/* route independently re-check
  // admin access server-side regardless of what this returns (see
  // src/app/api/admin/check/route.ts's own comment).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!d.isAdmin))
      .catch(() => {});
  }, []);

  const active = resources.filter((r) => !r.isArchived);
  const archivedCount = useStore((s) => s.stats?.archived) ?? resources.filter((r) => r.isArchived).length;
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

  // Real data only — there's no favoritedAt/archivedAt on a resource, so
  // "Added X" (its own real createdAt) is the one activity this can state
  // honestly. Same reasoning for the streak below: consecutive real
  // calendar days (local time) with at least one resource actually
  // created, never simulated.
  const recentActivity = [...active]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3);

  const activeDays = new Set(active.map((r) => localDayKey(new Date(r.createdAt))));
  let streak = 0;
  const cursor = new Date();
  while (activeDays.has(localDayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const today = new Date();
  const isoWeekday = (today.getDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setDate(today.getDate() - isoWeekday);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { label: DAY_LABELS[i], active: activeDays.has(localDayKey(d)) };
  });

  const mobileNavOpen = useUIStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);

  return (
    <>
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm animate-fade-in md:hidden"
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
        <NavLink href="/home" icon={Home} label="Home" />
      </div>

      <div className="flex flex-col gap-0.5">
        <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Library</p>
        <NavLink href="/resources" icon={Layers} label="All Resources" count={active.length} />
        <NavLink href="/favorites" icon={Star} label="Favorites" count={favoriteCount} iconClassName="text-warning" />
        <NavLink href="/recent" icon={Clock} label="Recently Added" count={recentCount} iconClassName="text-cyan" />
        <NavLink href="/archive" icon={Archive} label="Archived" count={archivedCount} />
        <NavLink href="/drops" icon={Inbox} label="Drops" iconClassName="text-accent" />
        <NavLink href="/discover" icon={Compass} label="Discover" iconClassName="text-violet" />
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
          <div className="flex items-center gap-2">
            <button
              onClick={openCreateStack}
              aria-label="Create Stack"
              title="Create Stack"
              className="text-text-muted hover:text-text-primary cursor-pointer"
            >
              <FolderPlus size={13} />
            </button>
            <Link href="/stacks" className="text-[11px] text-text-muted hover:text-text-primary">
              View all
            </Link>
          </div>
        </div>
        {stacks.slice(0, 6).map((s) => {
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
            {popularTags.map((t) => {
              const palette = SEMANTIC_COLOR_CLASSES[tagColor(t.name)];
              return (
                <Link
                  key={t.id}
                  href={`/resources?tag=${t.id}`}
                  className={cn(
                    "flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 font-mono text-[11px] transition-colors hover:brightness-110",
                    palette.soft,
                    palette.text
                  )}
                >
                  <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", palette.dot)} />
                  {t.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {recentActivity.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Recent activity</p>
          {recentActivity.map((r) => (
            <a
              key={r.id}
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 transition-colors hover:bg-surface-3"
            >
              <Favicon seed={r.title} size={18} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-text-secondary">
                  Added <span className="text-text-primary">{r.title}</span>
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-text-muted">{formatRelativeDate(r.createdAt)}</span>
            </a>
          ))}
        </div>
      )}

      {/* Always shown, not just when streak > 0 — otherwise the whole
          widget is invisible until the user happens to add something
          today, which reads as "missing" rather than "zero" (confirmed:
          that's exactly what hid it before). The 0-day message is just as
          real as the counted one, never fabricated either way. */}
      <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-gradient-to-br from-orange-soft to-transparent px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <Flame size={14} className="text-orange" />
          <p className="text-[12.5px] font-medium text-text-primary">
            {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"} streak` : "No streak yet"}
          </p>
        </div>
        {streak === 0 && <p className="px-0.5 text-[11px] text-text-muted">Add something today to start one.</p>}
        <div className="flex items-center justify-between px-0.5">
          {week.map((d, i) => (
            <span
              key={i}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold",
                d.active ? "bg-orange text-white" : "bg-surface-3 text-text-muted"
              )}
            >
              {d.label}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-4 border-t border-border pt-3">
        <div className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Organize</p>
          <NavLink href="/stack-studio" icon={Wand2} label="Stack Studio" iconClassName="text-violet" />
          <NavLink href="/import" icon={Upload} label="Import Bookmarks" iconClassName="text-orange" />
          <NavLink href="/settings/categories" icon={FolderTree} label="Manage Categories" iconClassName="text-warning" />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Connect</p>
          <NavLink href="/extension" icon={Puzzle} label="Browser Extension" iconClassName="text-cyan" />
        </div>
        <div className="flex flex-col gap-0.5">
          <NavLink href="/settings" icon={SlidersHorizontal} label="Settings" />
          {isAdmin && <NavLink href="/admin" icon={Shield} label="Admin" />}
          <button
            onClick={openFeedback}
            className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text-primary cursor-pointer"
          >
            <MessageSquare size={16} className="text-text-muted" /> Feedback
          </button>
        </div>
      </div>
      </aside>
    </>
  );
}
