import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Resource } from "@/lib/types";
import { Favicon } from "@/components/ui/favicon";
import { formatRelativeDate } from "@/lib/utils";

// Built entirely from each resource's own real `createdAt` — there's no
// `favoritedAt`/`archivedAt` timestamp in the data model, so this never
// claims "Favorited X 12 minutes ago" or similar: that would be a
// fabricated event the app can't actually prove happened then. "Added" is
// the one activity this can state honestly.
export function RecentActivityPanel({ resources }: { resources: Resource[] }) {
  const recent = [...resources]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-1 rounded-[var(--radius-lg)] border border-border bg-surface p-3">
      <div className="flex items-center justify-between px-2 pb-1.5">
        <h2 className="text-[13px] font-semibold text-text-primary">Recent Activity</h2>
        <Link href="/recent" className="flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-accent">
          View all <ArrowRight size={11} />
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="px-2 py-2 text-[12.5px] text-text-muted">Nothing added yet.</p>
      ) : (
        recent.map((r) => (
          <Link
            key={r.id}
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-surface-3"
          >
            <Favicon seed={r.title} size={26} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] text-text-primary">
                Added <span className="font-medium">{r.title}</span>
              </p>
              <p className="text-[11px] text-text-muted">{formatRelativeDate(r.createdAt)}</p>
            </div>
          </Link>
        ))
      )}
    </div>
  );
}
