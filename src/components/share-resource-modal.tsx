"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Send, Trash2 } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { decodeHtmlEntities } from "@/lib/utils";
import { MAX_SHARE_MESSAGE_LENGTH, type ShareVisibility } from "@/lib/resource-share-validation";

interface ShareRow {
  id: string;
  token: string;
  visibility: ShareVisibility;
  createdAt: string;
}

const OPTIONS: { value: ShareVisibility; label: string; hint: string }[] = [
  { value: "unlisted", label: "Unlisted", hint: "Anyone with the link can view it. It stays out of search engines." },
  { value: "public", label: "Public", hint: "Anyone can view it, and search engines may index the page." },
];

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

  return (
    <Modal open={!!shareResourceId} onClose={close} className="max-w-md">
      <ModalHeader title="Share resource" subtitle={resource?.domain} onClose={close} />
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto p-5">
        {resource && (
          <div className="rounded-[var(--radius-md)] border border-border bg-surface-3 p-3">
            <p className="text-[13.5px] font-medium text-text-primary">{decodeHtmlEntities(resource.title)}</p>
            <p className="mt-0.5 font-mono text-[11.5px] text-text-muted">{resource.domain}</p>
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-[12px] font-medium text-text-secondary">Who can view it</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] border border-border p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
            >
              <input
                type="radio"
                name="share-visibility"
                value={o.value}
                checked={visibility === o.value}
                onChange={() => setVisibility(o.value)}
                className="mt-1 accent-[var(--accent)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-medium text-text-primary">{o.label}</span>
                <span className="text-[12px] text-text-secondary">{o.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="share-message" className="text-[12px] font-medium text-text-secondary">
            Message (optional)
          </label>
          <textarea
            id="share-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, MAX_SHARE_MESSAGE_LENGTH))}
            rows={2}
            placeholder="Thought you'd find this useful"
            className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary focus:border-accent focus:outline-none"
          />
        </div>

        <Button onClick={create} disabled={creating || !resource} className="w-full">
          <Link2 size={14} /> {creating ? "Creating…" : "Create share link"}
        </Button>

        {created && (
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-success/40 bg-success-soft p-3">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">{shareUrl(created)}</span>
            <Button variant="secondary" size="sm" onClick={() => copy(created)}>
              <Copy size={13} /> Copy
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p className="text-[12px] font-medium text-text-secondary">Drop it to someone</p>
          <p className="text-[12px] text-text-muted">
            They need a KeepYourStack account with this email. They&apos;ll see it in their Drops inbox.
          </p>
          <div className="flex gap-2">
            <input
              type="email"
              value={dropEmail}
              onChange={(e) => setDropEmail(e.target.value)}
              placeholder="person@example.com"
              aria-label="Recipient email"
              className="h-9 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary focus:border-accent focus:outline-none"
            />
            <Button variant="secondary" onClick={sendDrop} disabled={dropping || !resource || !dropEmail.trim()}>
              <Send size={13} /> {dropping ? "Sending…" : "Drop"}
            </Button>
          </div>
        </div>

        {shares && shares.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] font-medium text-text-secondary">Active links</p>
            {shares.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border px-3 py-2">
                <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-secondary">
                  {s.visibility === "public" ? "Public" : "Unlisted"}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text-muted">/r/{s.token.slice(0, 8)}…</span>
                <button
                  type="button"
                  onClick={() => copy(s.token)}
                  aria-label="Copy link"
                  className="rounded-[var(--radius-sm)] p-1 text-text-muted hover:text-text-primary cursor-pointer"
                >
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => revoke(s.id)}
                  aria-label="Revoke link"
                  className="rounded-[var(--radius-sm)] p-1 text-text-muted hover:text-danger cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
