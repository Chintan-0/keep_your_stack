"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowUpRight, Download, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Favicon } from "@/components/ui/favicon";
import { Tag } from "@/components/ui/tag";
import { PRICING_LABELS } from "@/lib/utils";

export interface PublicResourceData {
  id: string;
  title: string;
  url: string;
  description: string;
  useCases: string[];
  categoryName: string | null;
  tags: string[];
  pricing: string | null;
  platform: string[];
}

export interface PublicStackData {
  id: string;
  ownerUsername: string;
  ownerName: string | null;
  name: string;
  description: string;
  icon: string;
  color: string;
  resources: PublicResourceData[];
}

/** Shared by /@username/slug (public) and /share/token (unlisted) — same look, different data source, so the page component just fetches and hands it this. */
export function PublicStackView({ stack, cloneUrl }: { stack: PublicStackData; cloneUrl: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setIsAuthed(!!data.user));
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return stack.resources;
    const q = query.toLowerCase();
    return stack.resources.filter(
      (r) => r.title.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [stack.resources, query]);

  const tagCloud = useMemo(() => {
    const seen = new Set<string>();
    for (const r of stack.resources) for (const t of r.tags) seen.add(t);
    return Array.from(seen).slice(0, 8);
  }, [stack.resources]);

  async function handleSave(resourceIds?: string[]) {
    if (isAuthed === false) {
      router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const isSingle = !!resourceIds && resourceIds.length === 1;
    if (isSingle) setSavingId(resourceIds![0]);
    else setSavingAll(true);
    try {
      const res = await fetch(cloneUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(resourceIds ? { resourceIds } : {}),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save.");
      if (isSingle) {
        toast.success(body.alreadyInLibrary > 0 ? "Already in your library" : "Saved to your KeepYourStack");
      } else {
        toast.success(
          body.added > 0
            ? `${body.added} resource${body.added === 1 ? "" : "s"} added${body.alreadyInLibrary > 0 ? ` · ${body.alreadyInLibrary} already in your library` : ""}`
            : `Already in your library (${body.alreadyInLibrary})`
        );
      }
      void fetch("/api/analytics/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "public_resource_saved", metadata: { stackId: stack.id } }),
      }).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save this stack.");
    } finally {
      setSavingAll(false);
      setSavingId(null);
    }
  }

  function trackOpen(resourceId: string) {
    void fetch("/api/analytics/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "public_resource_opened", metadata: { stackId: stack.id, resourceId } }),
    }).catch(() => {});
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Link href={`/@${stack.ownerUsername}`} className="w-fit text-[12.5px] text-text-secondary hover:text-accent">
          @{stack.ownerUsername}
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-text-primary">
          <span>{stack.icon}</span> {stack.ownerName ? `${stack.ownerName}'s ` : ""}
          {stack.name}
        </h1>
        {stack.description && <p className="max-w-xl text-[14px] text-text-secondary">{stack.description}</p>}
        <div className="flex items-center gap-3 text-[12.5px] text-text-muted">
          <span>{stack.resources.length} resources</span>
          {tagCloud.length > 0 && <span>{tagCloud.join(" · ")}</span>}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this stack…"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface-2 pl-9 pr-3 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>
        {stack.resources.length > 0 && (
          <Button size="sm" onClick={() => handleSave()} disabled={savingAll}>
            <Download size={14} /> {savingAll ? "Saving…" : "Save to my KeepYourStack"}
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-10 text-center">
          <Sparkles size={20} className="text-text-muted" />
          <p className="text-[13.5px] text-text-secondary">
            {stack.resources.length === 0 ? "This stack doesn't have any resources yet." : "No resources match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <Favicon seed={r.title} size={32} />
                <div className="min-w-0">
                  <h3 className="truncate text-[14px] font-semibold text-text-primary">{r.title}</h3>
                  <p className="truncate font-mono text-[11px] text-text-muted">{new URL(r.url).hostname.replace(/^www\./, "")}</p>
                </div>
              </div>
              <p className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{r.description || "No description yet."}</p>
              {r.useCases.length > 0 && (
                <p className="line-clamp-1 text-[12px] text-text-secondary">
                  <span className="text-text-muted">Useful for </span>
                  {r.useCases[0]}
                </p>
              )}
              {r.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {r.tags.slice(0, 4).map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                <span className="truncate text-[11px] text-text-muted">
                  {r.categoryName ?? (r.pricing ? PRICING_LABELS[r.pricing] : "")}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => trackOpen(r.id)}
                    className="flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-hover"
                  >
                    Open <ArrowUpRight size={13} />
                  </a>
                  <button
                    onClick={() => handleSave([r.id])}
                    disabled={savingId === r.id}
                    className="rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 py-1 text-[11.5px] font-medium text-text-primary hover:bg-surface-hover cursor-pointer"
                  >
                    {savingId === r.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
