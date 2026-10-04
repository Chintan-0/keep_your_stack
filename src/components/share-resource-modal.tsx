"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Send, Trash2, Globe, Lock } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Favicon } from "@/components/ui/favicon";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { decodeHtmlEntities, cn } from "@/lib/utils";
import { MAX_SHARE_MESSAGE_LENGTH, type ShareVisibility } from "@/lib/resource-share-validation";

interface ShareRow {
  id: string;
  token: string;
  visibility: ShareVisibility;
  createdAt: string;
}

const OPTIONS: { value: ShareVisibility; label: string; hint: string; icon: typeof Lock }[] = [
  {
    value: "unlisted",
    label: "Unlisted",
    hint: "Anyone with the link can view it. It stays out of search engines.",
    icon: Lock,
  },
  {
    value: "public",
    label: "Public",
    hint: "Anyone can view it, it appears in Discover, and search engines may index the page.",
    icon: Globe,
  },
];

const TITLE_ID = "share-resource-title";

function shareUrl(token: string) {
  return `${window.location.origin}/r/${token}`;
}

export function ShareResourceModal() {
  const shareResourceId = useUIStore((s) => s.shareResourceId);
  const closeShareResource = useUIStore((s) => s.closeShareResource);
  const resource = useStore((s) => (shareResourceId ? s.resources.find((r) => r.id === shareResourceId) : undefined));

  const [visibility, setVisibility] = useState<ShareVisibility>("unlisted");
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [dropEmail, setDropEmail] = useState("");
  const [dropping, setDropping] = useState(false);
  const [shares, setShares] = useState<ShareRow[] | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  useEffect(() => {
    if (!shareResourceId) return;
    let cancelled = false;
    fetch(`/api/resources/${shareResourceId}/shares`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { shares: ShareRow[] }) => {
        if (!cancelled) setShares(d.shares);
      })
      .catch(() => {
        if (!cancelled) setShares([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shareResourceId]);

  function close() {
    setShares(null);
    setCreated(null);
    setMessage("");
    setDropEmail("");
    setVisibility("unlisted");
    closeShareResource();
  }

  async function create() {
    if (!shareResourceId) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/resources/${shareResourceId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visibility, message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Couldn't create the link.");
      const share = body.share as ShareRow;
      setCreated(share.token);
      setShares((prev) => [share, ...(prev ?? [])]);
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't create the link.");
    } finally {
      setCreating(false);
    }
  }

  async function sendDrop() {
    if (!shareResourceId) return;
    setDropping(true);
    try {
      const res = await fetch(`/api/resources/${shareResourceId}/drops`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: dropEmail, message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "We couldn't send this Drop. Check the email address and try again.");
      toast.success(body.message ?? "Drop sent.");
      setDropEmail("");
      setMessage("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "We couldn't send this Drop. Check the email address and try again.");
    } finally {
      setDropping(false);
    }
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/resource-shares/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Couldn't revoke that link.");
      return;
    }
    setShares((prev) => (prev ?? []).filter((s) => s.id !== id));
    toast.success("Link revoked");
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy. Select the link and copy it manually.");
    }
  }

  const title = resource ? decodeHtmlEntities(resource.title) : "";

  return (
    <Modal
      open={!!shareResourceId}
      onClose={close}
      labelledBy={TITLE_ID}
      trapFocus
      className="w-full max-w-[580px] max-sm:flex max-sm:h-[100dvh] max-sm:max-w-none max-sm:flex-col max-sm:rounded-none"
    >
      <ModalHeader title="Share resource" subtitle={resource?.domain} onClose={close} titleId={TITLE_ID} />
      <div className="flex max-h-[calc(100dvh-9rem)] flex-col gap-5 overflow-y-auto p-5 max-sm:max-h-none max-sm:flex-1">
        {resource && (
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-3 p-3">
            <Favicon seed={resource.title} size={36} />
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-text-primary">{title}</p>
              <p className="truncate font-mono text-[11.5px] text-text-muted">{resource.domain}</p>
            </div>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[12px] font-medium text-text-secondary">Share with</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {OPTIONS.map((o) => {
              const selected = visibility === o.value;
              const Icon = o.icon;
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer flex-col gap-1 rounded-[var(--radius-md)] border p-3 transition-colors focus-within:ring-2 focus-within:ring-accent/50",
                    selected ? "border-accent bg-accent-soft" : "border-border hover:border-border-strong"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="share-visibility"
                      value={o.value}
                      checked={selected}
                      onChange={() => setVisibility(o.value)}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <Icon size={14} className={selected ? "text-accent" : "text-text-muted"} />
                    <span className="text-[13.5px] font-medium text-text-primary">{o.label}</span>
                  </span>
                  <span className="pl-6 text-[12px] leading-snug text-text-secondary">{o.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="share-message" className="flex justify-between text-[12px] font-medium text-text-secondary">
            <span>Message (optional)</span>
            <span className="font-mono text-[11px] text-text-muted" aria-live="polite">
              {message.length}/{MAX_SHARE_MESSAGE_LENGTH}
            </span>
          </label>
          <textarea
            id="share-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_SHARE_MESSAGE_LENGTH))}
            rows={2}
            placeholder="Thought you'd find this useful"
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-3 py-2 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          />
        </div>

        <section aria-labelledby="send-directly-heading" className="flex flex-col gap-2 rounded-[var(--radius-md)] bg-surface-3/60 p-3">
          <h3 id="send-directly-heading" className="text-[12px] font-medium text-text-secondary">
            Send directly
          </h3>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="drop-email" className="sr-only">
              Recipient email
            </label>
            <input
              id="drop-email"
              type="email"
              value={dropEmail}
              onChange={(e) => setDropEmail(e.target.value)}
              placeholder="person@example.com"
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            />
            <Button
              variant="secondary"
              onClick={sendDrop}
              disabled={dropping || !resource || !dropEmail.trim()}
              className="h-10 min-w-[104px] justify-center"
            >
              <Send size={13} /> {dropping ? "Sending…" : "Drop"}
            </Button>
          </div>
          <p className="text-[12px] text-text-muted">They&apos;ll receive it in their Drops inbox.</p>
        </section>

        <div className="flex flex-col gap-3">
          <Button onClick={create} disabled={creating || !resource} className="h-11 w-full justify-center">
            <Link2 size={14} /> {creating ? "Creating…" : "Create share link"}
          </Button>

          {created && (
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3">
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">{shareUrl(created)}</span>
              <Button variant="secondary" size="sm" onClick={() => copy(created)} className="min-h-[36px]">
                <Copy size={13} /> Copy
              </Button>
            </div>
          )}
        </div>

        {shares && shares.length > 0 && (
          <section aria-labelledby="active-links-heading" className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 id="active-links-heading" className="text-[12px] font-medium text-text-secondary">
              Active links
            </h3>
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px]",
                    s.visibility === "public" ? "bg-accent-soft text-accent" : "bg-surface-3 text-text-secondary"
                  )}
                >
                  {s.visibility === "public" ? "Public" : "Unlisted"}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text-muted">/r/{s.token.slice(0, 8)}…</span>
                <button
                  type="button"
                  onClick={() => copy(s.token)}
                  aria-label={`Copy link ${s.token.slice(0, 8)}`}
                  className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  aria-label={`Revoke link ${s.token.slice(0, 8)}`}
                  className="grid size-9 place-items-center rounded-[var(--radius-sm)] text-text-muted hover:text-danger focus-visible:ring-2 focus-visible:ring-accent/50 cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </Modal>
  );
}
