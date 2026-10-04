"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Compass, Bookmark, Flag, Layers, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { decodeHtmlEntities, cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { tagColor } from "@/lib/colors";

interface DiscoverShare {
  id: string;
  title: string;
  domain: string;
  description: string;
  tagNames: string[];
  message: string;
  categoryName: string | null;
  createdAt: string;
  saveCount: number;
  recentSaves: number;
  url: string;
}

interface PopularStack {
  id: string;
  name: string;
  description: string;
  icon: string;
  resourceCount: number;
  username: string;
  slug: string;
}

type Sort = "trending" | "new";

export default function DiscoverPage() {
  const [sort, setSort] = useState<Sort>("trending");
  const [category, setCategory] = useState<string | null>(null);
  const [shares, setShares] = useState<DiscoverShare[] | null>(null);
  const [stacks, setStacks] = useState<PopularStack[]>([]);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState("");
  const refreshStats = useStore((s) => s.refreshStats);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ sort });
    if (category) params.set("category", category);
    fetch(`/api/discover?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { shares: DiscoverShare[]; popularStacks: PopularStack[] }) => {
        if (cancelled) return;
        setShares(body.shares);
        setStacks(body.popularStacks);
        setError(false);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, category]);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const s of shares ?? []) if (s.categoryName) names.add(s.categoryName);
    return [...names].sort();
  }, [shares]);

  async function save(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/discover/${id}/save`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't save this resource.");
      setSavedIds((prev) => new Set(prev).add(id));
      toast.success(body.duplicate ? "Already in your library" : "Saved to My Stack");
      void refreshStats();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save this resource.");
    } finally {
      setBusyId(null);
    }
  }

  async function report(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/discover/${id}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reportReason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't send this report.");
      toast.success(body.outcome === "already_reported" ? "You already reported this" : "Thanks, we'll review it");
      setReportingId(null);
      setReportReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send this report.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Compass size={19} /> Discover
        </h1>
        <p className="font-mono text-[12.5px] text-text-muted">Public resources other people are sharing</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["trending", "new"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSort(s)}
            aria-pressed={sort === s}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] capitalize cursor-pointer",
              sort === s ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:text-text-primary"
            )}
          >
            {s}
          </button>
        ))}
        {categories.length > 0 && <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />}
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(category === c ? null : c)}
            aria-pressed={category === c}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] cursor-pointer",
              category === c ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:text-text-primary"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-danger">Couldn&apos;t load Discover. Refresh to try again.</p>}

      {!error && shares === null && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      )}

      {shares !== null && shares.length === 0 && (
        <EmptyState
          icon={Compass}
          title="Nothing public yet."
          description="When someone shares a resource publicly, it shows up here."
        />
      )}

      {shares !== null && shares.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {shares.map((s) => (
            <article key={s.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-[14px] font-semibold text-text-primary hover:text-accent"
                  >
                    {decodeHtmlEntities(s.title)}
                  </a>
                  <p className="font-mono text-[11.5px] text-text-muted">{s.domain}</p>
                </div>
                <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-secondary">
                  {sort === "trending" ? `${s.recentSaves} this week` : `${s.saveCount} saves`}
                </span>
              </div>
              {s.description && <p className="line-clamp-2 text-[13px] text-text-secondary">{decodeHtmlEntities(s.description)}</p>}
              {s.message && (
                <p className="rounded-[var(--radius-sm)] border-l-2 border-accent bg-accent-soft px-3 py-2 text-[12.5px] italic text-text-primary">
                  &ldquo;{s.message}&rdquo;
                </p>
              )}
              {s.tagNames.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {s.tagNames.map((t) => (
                    <Tag key={t} color={tagColor(t)}>
                      {t}
                    </Tag>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {savedIds.has(s.id) ? (
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] bg-success-soft px-3 text-[12.5px] font-medium text-success">
                    <Check size={13} /> Saved to your library
                  </span>
                ) : (
                  <Button size="sm" disabled={busyId === s.id} onClick={() => save(s.id)}>
                    <Bookmark size={13} /> Save to My Stack
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReportingId(reportingId === s.id ? null : s.id)}
                  aria-label={`Report ${s.title}`}
                >
                  <Flag size={13} /> Report
                </Button>
              </div>
              {reportingId === s.id && (
                <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border p-3">
                  <textarea
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value.slice(0, 500))}
                    rows={2}
                    placeholder="What's wrong with this resource?"
                    aria-label="Report reason"
                    className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
                  />
                  <Button size="sm" variant="secondary" disabled={busyId === s.id || !reportReason.trim()} onClick={() => report(s.id)} className="w-fit">
                    Send report
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {stacks.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide text-text-secondary">
            <Layers size={14} /> Popular public stacks
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stacks.map((st) => (
              <Link
                key={st.id}
                href={`/u/${encodeURIComponent(st.username)}/${encodeURIComponent(st.slug)}`}
                className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface p-4 transition-colors hover:border-border-strong"
              >
                <span className="text-[13.5px] font-semibold text-text-primary">
                  {st.icon} {st.name}
                </span>
                <span className="font-mono text-[11.5px] text-text-muted">
                  {st.resourceCount} resources · @{st.username}
                </span>
                {st.description && <span className="line-clamp-2 text-[12.5px] text-text-secondary">{st.description}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
