"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Inbox, Check, X, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCardSkeleton } from "@/components/ui/skeleton";
import { decodeHtmlEntities, cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

type DropStatus = "pending" | "saved" | "dismissed";

interface ReceivedDrop {
  id: string;
  status: DropStatus;
  createdAt: string;
  title: string;
  url: string;
  domain: string;
  description: string;
  message: string;
}

interface SentDrop {
  id: string;
  status: DropStatus;
  createdAt: string;
  title: string;
  domain: string;
  message: string;
}

const STATUS_LABEL: Record<DropStatus, string> = {
  pending: "Waiting",
  saved: "Saved",
  dismissed: "Dismissed",
};

const STATUS_CLASS: Record<DropStatus, string> = {
  pending: "bg-accent-soft text-accent",
  saved: "bg-success-soft text-success",
  dismissed: "bg-surface-3 text-text-muted",
};

export default function DropsPage() {
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [received, setReceived] = useState<ReceivedDrop[] | null>(null);
  const [sent, setSent] = useState<SentDrop[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const refreshStats = useStore((s) => s.refreshStats);

  async function load() {
    try {
      const res = await fetch("/api/drops");
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { received: ReceivedDrop[]; sent: SentDrop[] };
      setReceived(body.received);
      setSent(body.sent);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/drops")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body: { received: ReceivedDrop[]; sent: SentDrop[] }) => {
        if (cancelled) return;
        setReceived(body.received);
        setSent(body.sent);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function respond(id: string, action: "save" | "dismiss") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/drops/${id}/${action}`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Couldn't update this drop.");
      }
      if (action === "save") {
        const body = await res.json();
        toast.success(body.duplicate ? "Already in your library" : "Saved to My Stack");
        void refreshStats();
      } else {
        toast.success("Drop dismissed");
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update this drop.");
    } finally {
      setBusyId(null);
    }
  }

  const loading = !error && (received === null || sent === null);
  const pendingCount = received?.filter((d) => d.status === "pending").length ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Inbox size={19} /> Drops
        </h1>
        <p className="font-mono text-[12.5px] text-text-muted">
          Resources people sent you · {pendingCount} waiting
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-border">
        {(["received", "sent"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-[13px] capitalize cursor-pointer",
              tab === t ? "border-accent font-medium text-text-primary" : "border-transparent text-text-muted hover:text-text-primary"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-danger">Couldn&apos;t load your drops. Refresh to try again.</p>}

      {loading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <ResourceCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && tab === "received" && received && received.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="No drops yet."
          description="When someone with a KeepYourStack account drops a resource to you, it lands here."
        />
      )}

      {!loading && tab === "received" && received && received.length > 0 && (
        <div className="flex flex-col gap-2">
          {received.map((d) => (
            <article
              key={d.id}
              className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] font-medium text-text-primary hover:text-accent"
                  >
                    {decodeHtmlEntities(d.title)}
                  </a>
                  <p className="font-mono text-[11.5px] text-text-muted">{d.domain}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", STATUS_CLASS[d.status])}>
                  {STATUS_LABEL[d.status]}
                </span>
              </div>
              {d.description && <p className="text-[13px] text-text-secondary">{decodeHtmlEntities(d.description)}</p>}
              {d.message && (
                <p className="rounded-[var(--radius-sm)] border-l-2 border-accent bg-accent-soft px-3 py-2 text-[12.5px] italic text-text-primary">
                  &ldquo;{d.message}&rdquo;
                </p>
              )}
              {d.status === "pending" && (
                <div className="flex gap-2">
                  <Button size="sm" disabled={busyId === d.id} onClick={() => respond(d.id, "save")}>
                    <Bookmark size={13} /> Save to My Stack
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busyId === d.id} onClick={() => respond(d.id, "dismiss")}>
                    <X size={13} /> Dismiss
                  </Button>
                </div>
              )}
              {d.status === "saved" && (
                <p className="flex items-center gap-1.5 text-[12px] text-success">
                  <Check size={13} /> In your library
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {!loading && tab === "sent" && sent && sent.length === 0 && (
        <EmptyState
          icon={Inbox}
          title="Nothing sent yet."
          description="Use Share on a resource and drop it to someone by email."
        />
      )}

      {!loading && tab === "sent" && sent && sent.length > 0 && (
        <div className="flex flex-col gap-2">
          {sent.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-text-primary">{decodeHtmlEntities(d.title)}</p>
                <p className="font-mono text-[11.5px] text-text-muted">{d.domain}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px]", STATUS_CLASS[d.status])}>
                {STATUS_LABEL[d.status]}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
