"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";
import { Modal, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Favicon } from "@/components/ui/favicon";
import { CategorySelector } from "@/components/category-selector";
import { StackSelector } from "@/components/stack-selector";
import { TagInput } from "@/components/tag-input";
import { useStore } from "@/lib/store";
import { useUIStore } from "@/lib/ui-store";
import { normalizeUrl, getDomain } from "@/lib/utils";
import type { FetchedMetadata } from "@/lib/data/metadata";
import type { Resource } from "@/lib/types";

async function fetchMetadata(
  url: string
): Promise<{ ok: true; data: FetchedMetadata } | { ok: false; domain: string }> {
  const res = await fetch("/api/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) return { ok: false, domain: getDomain(url) };
  return res.json();
}

type Stage = "url" | "loading" | "details" | "unreachable" | "duplicate";

// Wrapper: stays mounted for the app's lifetime, only reads open/close state
// from the UI store. The actual form lives in AddResourceForm, which Modal
// only mounts while `open` is true — so every open is naturally a fresh
// mount with clean state, no manual "reset on open" effect required.
export function AddResourceModal() {
  const open = useUIStore((s) => s.addResourceOpen);
  const prefillUrl = useUIStore((s) => s.addResourcePrefillUrl);
  const close = useUIStore((s) => s.closeAddResource);

  return (
    <Modal open={open} onClose={close} className="max-w-xl" labelledBy="add-resource-title">
      {open && <AddResourceForm prefillUrl={prefillUrl} onClose={close} />}
    </Modal>
  );
}

function AddResourceForm({ prefillUrl, onClose }: { prefillUrl: string; onClose: () => void }) {
  const addResource = useStore((s) => s.addResource);
  const findByUrl = useStore((s) => s.findByUrl);
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("url");
  const [url, setUrl] = useState(prefillUrl);
  const [duplicateOf, setDuplicateOf] = useState<Resource | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [useCaseDraft, setUseCaseDraft] = useState("");
  const [useCases, setUseCases] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [stackIds, setStackIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmitUrl = useMemo(() => !!normalizeUrl(url), [url]);

  async function handleFetch(rawUrl: string) {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) return;

    const existing = findByUrl(normalized);
    if (existing) {
      setDuplicateOf(existing);
      setStage("duplicate");
      return;
    }

    setStage("loading");
    const result = await fetchMetadata(normalized);
    if (result.ok) {
      setTitle(result.data.title);
      setDescription(result.data.description);
      setDomain(result.data.domain);
      setFaviconUrl(result.data.faviconUrl);
      setImageUrl(result.data.imageUrl);
      setStage("details");
    } else {
      setDomain(result.domain);
      setTitle("");
      setDescription("");
      setStage("unreachable");
    }
  }

  // One-time kickoff when opened with a prefilled URL (e.g. from the
  // extension preview). handleFetch is async, so any resulting state
  // updates happen after the effect body itself has returned.
  useEffect(() => {
    if (!prefillUrl) return;
    const timer = setTimeout(() => void handleFetch(prefillUrl), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addUseCase() {
    const v = useCaseDraft.trim();
    if (!v) return;
    setUseCases((prev) => [...prev, v]);
    setUseCaseDraft("");
  }

  async function save(force = false) {
    setSaving(true);
    try {
      const { resource, duplicate } = await addResource(
        {
          url,
          title,
          description,
          categoryId,
          useCases,
          notes,
          tagNames: tags,
          stackIds,
          faviconUrl,
          imageUrl,
        },
        { force }
      );
      if (duplicate) {
        setDuplicateOf(resource);
        setStage("duplicate");
        return;
      }
      toast.success(`Saved ${resource.title} to your stack`, {
        action: {
          label: "View",
          onClick: () => router.push(`/resources/${resource.id}`),
        },
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save your resource. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <ModalHeader title="Add Resource" subtitle="Paste a URL — everything else is optional." onClose={onClose} />

      <div className="max-h-[70vh] overflow-y-auto p-5">
        {stage === "url" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmitUrl) void handleFetch(url);
            }}
            className="flex flex-col gap-3"
          >
            <label className="text-[12px] font-medium text-text-secondary">Paste a URL</label>
            <div className="relative">
              <Link2 size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://squoosh.app"
                className="h-11 w-full rounded-[var(--radius-md)] border border-border-strong bg-surface-3 pl-9 pr-3 font-mono text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
            </div>
            <Button type="submit" disabled={!canSubmitUrl} className="mt-1 w-full">
              Continue
            </Button>
          </form>
        )}

        {stage === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Loader2 className="animate-spin text-accent" size={22} />
            <p className="text-[13px] text-text-secondary">Fetching page details…</p>
          </div>
        )}

        {stage === "duplicate" && duplicateOf && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 p-3.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" />
              <div>
                <p className="text-[13px] font-medium text-text-primary">You already saved this resource.</p>
                <p className="mt-0.5 text-[12px] text-text-secondary">{duplicateOf.title} · {duplicateOf.domain}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => { router.push(`/resources/${duplicateOf.id}`); onClose(); }}>
                Open Resource
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setTitle(duplicateOf.title);
                  setDescription(duplicateOf.description);
                  setDomain(duplicateOf.domain);
                  setStage("details");
                }}
              >
                Save Anyway
              </Button>
            </div>
          </div>
        )}

        {stage === "unreachable" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft p-3.5">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
              <div>
                <p className="text-[13px] font-medium text-text-primary">We couldn&apos;t read this page.</p>
                <p className="mt-0.5 text-[12px] text-text-secondary">
                  You can still save the URL and add the details manually.
                </p>
              </div>
            </div>
            <Button
              onClick={() => {
                setTitle(domain);
                setStage("details");
              }}
            >
              Continue Anyway
            </Button>
          </div>
        )}

        {stage === "details" && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-success/30 bg-success-soft px-3 py-2.5">
              <Favicon seed={title || domain} size={28} />
              <div className="min-w-0 flex-1">
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-transparent text-[14px] font-semibold text-text-primary focus:outline-none"
                  placeholder="Resource title"
                />
                <p className="truncate font-mono text-[11px] text-text-muted">{domain || getDomain(url)}</p>
              </div>
              <CheckCircle2 size={16} className="shrink-0 text-success" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-text-secondary">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What does this do?"
                className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
                <Sparkles size={13} className="text-accent" /> What is this useful for?
              </label>
              <div className="flex gap-2">
                <input
                  value={useCaseDraft}
                  onChange={(e) => setUseCaseDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addUseCase();
                    }
                  }}
                  placeholder="e.g. Compress images before upload"
                  className="h-9 flex-1 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                />
                <Button type="button" variant="secondary" size="sm" onClick={addUseCase}>
                  Add
                </Button>
              </div>
              {useCases.length > 0 && (
                <ul className="flex flex-col gap-1 pt-0.5">
                  {useCases.map((uc, i) => (
                    <li key={i} className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                      <span className="text-accent">•</span>
                      {uc}
                      <button
                        type="button"
                        onClick={() => setUseCases(useCases.filter((_, idx) => idx !== i))}
                        className="ml-auto text-text-muted hover:text-danger cursor-pointer"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-text-secondary">Category</label>
                <CategorySelector value={categoryId} onChange={setCategoryId} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-text-secondary">Tags</label>
                <TagInput value={tags} onChange={setTags} />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-text-secondary">Stack</label>
              <StackSelector value={stackIds} onChange={setStackIds} />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-text-secondary">Your note</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Use this before uploading large hero images…"
                className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2.5 py-2 text-[13px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {stage === "details" && (
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3.5">
          <span className="font-mono text-[11px] text-text-muted">Saves instantly · edit anytime</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => save(!!duplicateOf)} disabled={saving}>
              Save Resource
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
