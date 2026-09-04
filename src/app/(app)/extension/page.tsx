"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Puzzle, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { Favicon } from "@/components/ui/favicon";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { StackSelector } from "@/components/stack-selector";
import { TagInput } from "@/components/tag-input";

const DEMO_PAGE = {
  title: "Bruno",
  url: "https://usebruno.com/downloads",
  description: "Download Bruno, the offline-first Git-friendly API client.",
};

export default function ExtensionPage() {
  const addResource = useStore((s) => s.addResource);
  const [useCase, setUseCase] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [stackIds, setStackIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    try {
      const { duplicate } = await addResource({
        url: DEMO_PAGE.url,
        title: DEMO_PAGE.title,
        description: DEMO_PAGE.description,
        categoryId,
        useCases: useCase ? [useCase] : [],
        tagNames: tags,
        stackIds,
        notes: note,
      });
      if (duplicate) {
        toast.message("Already in your stack.");
      } else {
        toast.success("Saved to KeepYourStack");
      }
      setSaved(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save this page.");
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text-primary">
          <Puzzle size={19} /> Browser Extension
        </h1>
        <p className="max-w-xl text-[13px] text-text-secondary">
          The extension is a fast capture layer — click it on any page to save that page to KeepYourStack
          with its metadata already filled in. It does not run in the background or sync automatically; it
          only saves when you tell it to.
        </p>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex flex-col gap-3 sm:w-72">
          <p className="text-[12px] font-medium text-text-secondary">Live preview</p>
          <p className="text-[12.5px] text-text-secondary">
            This simulates clicking the KeepYourStack extension icon while viewing{" "}
            <span className="font-mono text-text-primary">{DEMO_PAGE.url}</span>. Try filling it out and
            saving — it writes to your real library.
          </p>
          <Button variant="secondary" size="sm" className="w-fit" disabled>
            Install Extension — Coming Soon
          </Button>
        </div>

        {/* Popup mockup */}
        <div className="w-full max-w-sm overflow-hidden rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 shadow-2xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-5 w-5 items-center justify-center rounded-[5px] bg-gradient-to-br from-accent to-violet text-[10px] font-bold text-white">
                K
              </div>
              <span className="text-[12.5px] font-semibold text-text-primary">KeepYourStack</span>
            </div>
            <X size={14} className="text-text-muted" />
          </div>

          {!saved ? (
            <div className="flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface-3 p-2.5">
                <Favicon seed={DEMO_PAGE.title} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-text-primary">{DEMO_PAGE.title}</p>
                  <p className="truncate font-mono text-[10.5px] text-text-muted">{DEMO_PAGE.url}</p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-secondary">Useful for</label>
                <input
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  placeholder="Testing REST APIs"
                  className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[12.5px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-secondary">Category</label>
                <CategorySelector value={categoryId} onChange={setCategoryId} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-secondary">Tags</label>
                <TagInput value={tags} onChange={setTags} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-secondary">Stack</label>
                <StackSelector value={stackIds} onChange={setStackIds} />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-text-secondary">Personal note</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="resize-none rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 py-1.5 text-[12.5px] text-text-primary focus:border-accent focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <Button size="sm" className="flex-1" onClick={save}>
                  Save to KeepYourStack
                </Button>
              </div>
              <button onClick={save} className="text-center text-[11.5px] text-text-muted hover:text-text-primary cursor-pointer">
                Save &amp; Close
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-success/20 text-success">✓</div>
              <p className="text-[13px] font-medium text-text-primary">Saved to KeepYourStack</p>
              <button
                onClick={() => setSaved(false)}
                className="text-[11.5px] text-accent hover:text-accent-hover cursor-pointer"
              >
                Save another page
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
