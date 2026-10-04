"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface OpenReport {
  id: string;
  shareId: string;
  reason: string;
  createdAt: string;
  shareTitle: string;
  shareDomain: string;
  shareHidden: boolean;
  openReportCount: number;
}

interface HiddenShare {
  shareId: string;
  title: string;
  domain: string;
  hiddenReason: string | null;
  hiddenAt: string;
}

interface QueueResponse {
  reports: OpenReport[];
  hiddenShares: HiddenShare[];
}

export function ShareReportsQueue() {
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/share-reports")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: QueueResponse) => {
        if (!cancelled) setQueue(d);
      })
      .catch(() => {
        if (!cancelled) setQueue({ reports: [], hiddenShares: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  async function call(url: string, body: object, success: string, key: string) {
    setBusyId(key);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Couldn't update this item.");
      }
      toast.success(success);
      setVersion((v) => v + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update this item.");
    } finally {
      setBusyId(null);
    }
  }

  const hideShare = (shareId: string) => call(`/api/admin/shares/${shareId}`, { action: "hide" }, "Share hidden", `share:${shareId}`);
  const restoreShare = (shareId: string) =>
    call(`/api/admin/shares/${shareId}`, { action: "restore" }, "Share restored", `share:${shareId}`);
  const dismissReport = (id: string) => call(`/api/admin/share-reports/${id}`, { action: "dismiss" }, "Report dismissed", `report:${id}`);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-10">
      <h1 className="text-xl font-semibold text-text-primary">Share reports</h1>

      {queue === null && <p className="text-[13px] text-text-muted">Loading…</p>}

      {queue !== null && queue.reports.length === 0 && <p className="text-[13px] text-text-muted">No open reports.</p>}

      {queue?.reports.map((r) => (
        <article key={r.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13.5px] font-medium text-text-primary">{r.shareTitle}</p>
            <span className="font-mono text-[11.5px] text-text-muted">
              {r.openReportCount} open · {r.shareHidden ? "hidden" : "visible"}
            </span>
          </div>
          <p className="font-mono text-[11.5px] text-text-muted">{r.shareDomain}</p>
          <p className="text-[13px] text-text-secondary">&ldquo;{r.reason}&rdquo;</p>
          <div className="flex gap-2">
            {r.shareHidden ? (
              <Button size="sm" disabled={busyId === `share:${r.shareId}`} onClick={() => restoreShare(r.shareId)}>
                Restore share
              </Button>
            ) : (
              <Button size="sm" disabled={busyId === `share:${r.shareId}`} onClick={() => hideShare(r.shareId)}>
                Hide share
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busyId === `report:${r.id}`} onClick={() => dismissReport(r.id)}>
              Dismiss report
            </Button>
          </div>
        </article>
      ))}

      {queue && queue.hiddenShares.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-[12px] font-medium uppercase tracking-wide text-text-secondary">Hidden shares</h2>
          {queue.hiddenShares.map((h) => (
            <div key={h.shareId} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface p-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-text-primary">{h.title}</p>
                <p className="font-mono text-[11.5px] text-text-muted">
                  {h.domain} · {h.hiddenReason === "reported" ? "auto-hidden by reports" : "hidden by moderator"}
                </p>
              </div>
              <Button size="sm" disabled={busyId === `share:${h.shareId}`} onClick={() => restoreShare(h.shareId)}>
                Restore share
              </Button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
