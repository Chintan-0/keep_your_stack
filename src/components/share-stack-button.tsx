"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Share2, Link2, Globe, Eye, Lock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
// Local-only cache update after a visibility change — deliberately NOT
// store.updateStack(), which also fires a network PATCH to the generic
// /api/stacks/[id] route; that route doesn't know about visibility/slug
// at all, so it'd be a pointless, potentially-empty-body second request.
// The real change already happened via PATCH .../visibility above.
import { createClient } from "@/lib/supabase/client";
import type { Stack } from "@/lib/types";

// Part G's Share button. The owner explicitly picks a visibility — never
// changed as a side effect of anything else. Every action here calls the
// server (PATCH /api/stacks/[id]/visibility, which re-verifies ownership
// itself), never mutates visibility client-side-only.
export function ShareStackButton({ stack }: { stack: Stack }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase.from("profiles").select("username").eq("id", data.user.id).maybeSingle();
      setUsername(profile?.username ?? null);
    });
  }, []);

  const publicUrl = stack.slug && username ? `${window.location.origin}/@${username}/${stack.slug}` : null;

  async function setVisibility(visibility: "private" | "unlisted" | "public") {
    if (visibility === "public" && !username) {
      toast.error("Set a username in Settings first — a public stack needs a public profile URL.");
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/stacks/${stack.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't change visibility.");
      useStore.setState((s) => ({
        stacks: s.stacks.map((st) => (st.id === stack.id ? { ...st, visibility: body.stack.visibility, slug: body.stack.slug } : st)),
      }));

      if (visibility === "private") {
        toast.success("Stack is now private.");
      } else if (visibility === "unlisted" && body.shareUrl) {
        await copyLink(`${window.location.origin}${body.shareUrl}`);
        toast.success("Unlisted — share link copied.");
      } else if (visibility === "public") {
        toast.success("Stack is now public.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change visibility.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be unavailable (permissions, non-secure context) — the toast below still confirms the action happened server-side even if copying silently failed.
    }
  }

  async function handleCopyLink() {
    if (stack.visibility === "public" && publicUrl) {
      await copyLink(publicUrl);
      toast.success("Link copied");
      setOpen(false);
      return;
    }
    if (stack.visibility === "unlisted") {
      // Fetch the current (or a fresh, if none active) share link rather
      // than guessing — regenerate is idempotent when one's already active
      // isn't guaranteed, so route through the same visibility endpoint,
      // which reuses an existing token.
      setBusy(true);
      try {
        const res = await fetch(`/api/stacks/${stack.id}/visibility`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: "unlisted" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (body.shareUrl) {
          await copyLink(`${window.location.origin}${body.shareUrl}`);
          toast.success("Link copied");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't copy the link.");
      } finally {
        setBusy(false);
        setOpen(false);
      }
      return;
    }
    toast.error("Make this stack public or unlisted first to get a shareable link.");
  }

  async function handleRegenerate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/stacks/${stack.id}/share-link`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      await copyLink(`${window.location.origin}${body.shareUrl}`);
      toast.success("New link copied — the old one no longer works.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't regenerate the link.");
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} disabled={busy}>
        <Share2 size={13} /> Share
      </Button>
      {open && (
        <div className="absolute right-0 top-10 z-20 w-56 overflow-hidden rounded-[var(--radius-md)] border border-border-strong bg-surface-2 py-1 shadow-xl">
          <div className="border-b border-border px-3 py-2 text-[11.5px] text-text-muted">
            Currently: <span className="font-medium text-text-primary">{stack.visibility}</span>
          </div>
          <button
            onClick={handleCopyLink}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
          >
            <Link2 size={14} /> Copy link
          </button>
          {stack.visibility === "unlisted" && (
            <button
              onClick={handleRegenerate}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 cursor-pointer"
            >
              <RefreshCw size={14} /> Regenerate link
            </button>
          )}
          <div className="my-1 border-t border-border" />
          <button
            onClick={() => setVisibility("public")}
            disabled={stack.visibility === "public"}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 disabled:opacity-40 cursor-pointer"
          >
            <Globe size={14} /> Make public
          </button>
          <button
            onClick={() => setVisibility("unlisted")}
            disabled={stack.visibility === "unlisted"}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 disabled:opacity-40 cursor-pointer"
          >
            <Eye size={14} /> Make unlisted
          </button>
          <button
            onClick={() => setVisibility("private")}
            disabled={stack.visibility === "private"}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-3 disabled:opacity-40 cursor-pointer"
          >
            <Lock size={14} /> Make private
          </button>
        </div>
      )}
    </div>
  );
}
