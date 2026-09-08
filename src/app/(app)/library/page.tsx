"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Copy,
  Link2,
  HelpCircle,
  FileQuestion,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  Check,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Favicon } from "@/components/ui/favicon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { categoryName, cn } from "@/lib/utils";
import type { Resource } from "@/lib/types";

interface LibraryHealthSummary {
  totalResources: number;
  duplicateGroups: number;
  linkIssues: number;
  needsReview: number;
  missingMetadata: number;
}

interface DuplicateGroup {
  ids: string[];
  confidence: number;
  resources: Resource[];
}

// Groups the user has explicitly decided aren't duplicates. Duplicate
// candidates are computed fresh on every load (there's no stored
// duplicate_groups table — see src/lib/data/library-health.ts), so this is
// the one piece of "did the user already deal with this?" state that has
// to live somewhere client-side rather than being derivable from the data
// itself. Per-browser, not synced — acceptable for a personal toolbox.
const IGNORED_GROUPS_KEY = "kys_ignored_duplicate_groups";

function groupKey(ids: string[]): string {
  return [...ids].sort().join(",");
}

function readIgnoredGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(IGNORED_GROUPS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeIgnoredGroups(keys: Set<string>) {
  try {
    localStorage.setItem(IGNORED_GROUPS_KEY, JSON.stringify([...keys]));
  } catch {
    // Private browsing / storage disabled — the group will just keep showing. Not worth surfacing an error for.
  }
}

export default function LibraryHealthPage() {
  const categories = useStore((s) => s.categories);
  const mergeResources = useStore((s) => s.mergeResources);
  const recheckLibrary = useStore((s) => s.recheckLibrary);

  const [health, setHealth] = useState<LibraryHealthSummary | null>(null);
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  // Read once on the client after mount — reading localStorage during the
  // initial render would differ between server (no window) and hydration.
  const [ignoredGroups, setIgnoredGroups] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, dupRes] = await Promise.all([
        fetch("/api/library/health").then((r) => r.json()),
        fetch("/api/library/duplicates").then((r) => r.json()),
      ]);
      setHealth(healthRes.health);
      setGroups(dupRes.groups ?? []);
    } catch {
      toast.error("Couldn't load library health. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIgnoredGroups(readIgnoredGroups());
    void load();
  }, [load]);

  const visibleGroups = useMemo(
    () => groups.filter((g) => !ignoredGroups.has(groupKey(g.ids))),
    [groups, ignoredGroups]
  );

  function ignoreGroup(ids: string[]) {
    const next = new Set(ignoredGroups);
    next.add(groupKey(ids));
    setIgnoredGroups(next);
    writeIgnoredGroups(next);
  }

  async function keepThisOne(group: DuplicateGroup, keeperId: string) {
    const key = groupKey(group.ids);
    setMergingKey(key);
    try {
      for (const loserId of group.ids.filter((id) => id !== keeperId)) {
        await mergeResources(keeperId, loserId);
      }
      toast.success("Merged into one resource");
      ignoreGroup(group.ids);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't merge these resources.");
    } finally {
      setMergingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
            <Activity size={19} className="text-accent" /> Library Health
          </h1>
          <p className="text-[13px] text-text-secondary">
            A snapshot of your library — duplicates, broken links, and resources that could use more detail.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={rechecking}
          onClick={async () => {
            setRechecking(true);
            try {
              const { checked } = await recheckLibrary();
              toast.success(checked > 0 ? `Checked ${checked} link${checked === 1 ? "" : "s"}` : "Nothing to check");
              void load();
            } catch {
              toast.error("Couldn't run link checks. Try again.");
            } finally {
              setRechecking(false);
            }
          }}
        >
          {rechecking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Recheck Links
        </Button>
      </div>

      {/* Real counts only — never placeholder/fake stats. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <HealthCard icon={Copy} label="Resources" value={health?.totalResources} loading={loading} />
        <HealthCard icon={Copy} label="Possible Duplicates" value={health?.duplicateGroups} loading={loading} accent="text-warning" />
        <HealthCard icon={Link2} label="Link Issues" value={health?.linkIssues} loading={loading} accent="text-danger" />
        <HealthCard
          icon={HelpCircle}
          label="Needs Review"
          value={health?.needsReview}
          loading={loading}
          accent="text-warning"
          href="/resources?needsReview=1"
        />
        <HealthCard icon={FileQuestion} label="Missing Metadata" value={health?.missingMetadata} loading={loading} />
      </section>

      {/* Duplicate Center */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-primary">Duplicate Center</h2>
          {visibleGroups.length > 0 && (
            <span className="font-mono text-[11.5px] text-text-muted">
              {visibleGroups.length} possible duplicate{visibleGroups.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {loading ? (
          <div className="h-24 animate-pulse rounded-[var(--radius-lg)] border border-border bg-surface" />
        ) : visibleGroups.length === 0 ? (
          <EmptyState
            icon={Check}
            title="No possible duplicates."
            description="We'll flag resources here when two look like the same thing saved twice."
          />
        ) : (
          <div className="flex flex-col gap-4">
            {visibleGroups.map((group) => {
              const key = groupKey(group.ids);
              const busy = mergingKey === key;
              return (
                <div key={key} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-warning/25 bg-warning/5 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12.5px] text-text-secondary">
                      These look like the same resource, saved {group.ids.length} times.
                    </p>
                    <button
                      onClick={() => ignoreGroup(group.ids)}
                      className="flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
                    >
                      <EyeOff size={12} /> Not a duplicate
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {group.resources.map((r) => (
                      <div
                        key={r.id}
                        className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-3"
                      >
                        <div className="flex items-center gap-2.5">
                          <Favicon seed={r.title} size={28} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-text-primary">{r.title}</p>
                            <p className="truncate font-mono text-[11px] text-text-muted">{r.domain}</p>
                          </div>
                        </div>
                        <p className="text-[11.5px] text-text-muted">
                          {categoryName(r.categoryId, categories)}
                          {r.isFavorite && " · Favorite"}
                        </p>
                        <div className="mt-auto flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => keepThisOne(group, r.id)}
                          >
                            {busy ? <Loader2 size={12} className="animate-spin" /> : null} Keep this one
                          </Button>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11.5px] text-text-muted hover:text-accent"
                          >
                            Open <ArrowUpRight size={11} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Keeping one merges notes, tags, favorite, and category from both — nothing is silently discarded.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-text-primary">Needs attention</h2>
        <Link
          href="/resources?needsReview=1"
          className={cn(
            "flex items-center justify-between rounded-[var(--radius-lg)] border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-2"
          )}
        >
          <span className="flex items-center gap-2.5 text-[13.5px] text-text-primary">
            <HelpCircle size={16} className="text-warning" /> Review resources with missing details or link issues
          </span>
          <ArrowUpRight size={15} className="text-text-muted" />
        </Link>
      </section>
    </div>
  );
}

function HealthCard({
  icon: Icon,
  label,
  value,
  loading,
  accent,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  loading: boolean;
  accent?: string;
  href?: string;
}) {
  const content = (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-3.5 transition-colors hover:border-border-strong">
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-surface-3", accent ?? "text-accent")}>
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[17px] font-semibold leading-tight text-text-primary">{loading ? "–" : value ?? 0}</p>
        <p className="text-[11.5px] text-text-secondary">{label}</p>
      </div>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
