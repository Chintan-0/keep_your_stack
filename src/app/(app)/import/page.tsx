"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileUp, Check, ArrowLeft, AlertTriangle, FolderOpen, Pencil } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseBookmarksHtml, looksLikeBookmarkExport, type ParsedBookmark } from "@/lib/bookmark-import";
import { groupByFolder, suggestCategoryForFolder, suggestStackForFolder } from "@/lib/import-organizer";
import { runWithConcurrency } from "@/lib/concurrency";
import { normalizeUrl, getDomain, cn } from "@/lib/utils";
import { Favicon } from "@/components/ui/favicon";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { Dropdown } from "@/components/ui/dropdown";
import { TagInput } from "@/components/tag-input";
import type { Resource } from "@/lib/types";
import type { FetchedMetadata } from "@/lib/data/metadata";

type Stage = "upload" | "preview" | "importing" | "done";

const GROUP_KEY = (folder: string | null) => folder ?? "__none__";

interface GroupChoice {
  categoryId: string | null;
  /** "none" | "existing" | "new" */
  stackMode: "none" | "existing" | "new";
  existingStackId: string;
  newStackName: string;
  tagNames: string[];
}

/** A bookmark's own choice, when it's been individually corrected away from its group's. */
interface BookmarkOverride {
  categoryId: string | null;
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const findByUrl = useStore((s) => s.findByUrl);
  const stacks = useStore((s) => s.stacks);
  const categories = useStore((s) => s.categories);
  const addStack = useStore((s) => s.addStack);
  const hydrate = useStore((s) => s.hydrate);

  const [stage, setStage] = useState<Stage>("upload");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [bookmarks, setBookmarks] = useState<ParsedBookmark[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupChoices, setGroupChoices] = useState<Map<string, GroupChoice>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, BookmarkOverride>>(new Map());
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [progress, setProgress] = useState<{ phase: "saving" | "enriching"; done: number; total: number } | null>(
    null
  );
  const [summary, setSummary] = useState({ imported: 0, duplicates: 0, failed: 0, enrichFailed: 0, categorized: 0 });

  const duplicateUrls = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookmarks) {
      if (findByUrl(b.url)) set.add(b.url);
    }
    return set;
  }, [bookmarks, findByUrl]);

  const newCount = bookmarks.length - duplicateUrls.size;
  const groups = useMemo(() => groupByFolder(bookmarks), [bookmarks]);

  function effectiveCategoryId(url: string, groupKey: string): string | null {
    const override = overrides.get(url);
    if (override) return override.categoryId;
    return groupChoices.get(groupKey)?.categoryId ?? null;
  }

  const suggestedCount = useMemo(
    () => bookmarks.filter((b) => selected.has(b.url) && effectiveCategoryId(b.url, GROUP_KEY(b.folder))).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarks, selected, groupChoices, overrides]
  );

  async function handleFile(file: File) {
    setFileError(null);
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      setFileError("This doesn't look like a browser bookmark file. Try exporting your bookmarks from Chrome and upload the HTML file again.");
      return;
    }
    const text = await file.text();
    if (!looksLikeBookmarkExport(text)) {
      setFileError(
        "This doesn't look like a browser bookmark file. Try exporting your bookmarks from Chrome and upload the HTML file again."
      );
      return;
    }

    const parsed = parseBookmarksHtml(text);
    if (parsed.length === 0) {
      setFileError("No bookmarks were found in that file.");
      return;
    }

    setFileName(file.name);
    setBookmarks(parsed);
    setSelected(new Set(parsed.filter((b) => !findByUrl(b.url)).map((b) => b.url)));
    setOverrides(new Map());

    // Seed each folder group's organization choice from a real suggestion —
    // an existing category/stack it actually matches, never an invented one.
    const groupedForSuggestions = groupByFolder(parsed);
    const choices = new Map<string, GroupChoice>();
    for (const g of groupedForSuggestions) {
      const categoryId = suggestCategoryForFolder(g.folder, categories);
      const stackSuggestion = suggestStackForFolder(g.folder, stacks);
      choices.set(GROUP_KEY(g.folder), {
        categoryId,
        stackMode: stackSuggestion.existingStackId ? "existing" : stackSuggestion.suggestedName ? "new" : "none",
        existingStackId: stackSuggestion.existingStackId ?? "",
        newStackName: stackSuggestion.suggestedName ?? "",
        tagNames: [],
      });
    }
    setGroupChoices(choices);
    setStage("preview");
  }

  function toggle(url: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function toggleGroup(group: ReturnType<typeof groupByFolder>[number], select: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const b of group.bookmarks) {
        if (select && !duplicateUrls.has(b.url)) next.add(b.url);
        else if (!select) next.delete(b.url);
      }
      return next;
    });
  }

  function updateGroupChoice(key: string, patch: Partial<GroupChoice>) {
    setGroupChoices((prev) => {
      const next = new Map(prev);
      const current = next.get(key) ?? {
        categoryId: null,
        stackMode: "none" as const,
        existingStackId: "",
        newStackName: "",
        tagNames: [],
      };
      next.set(key, { ...current, ...patch });
      return next;
    });
  }

  function setOverride(url: string, categoryId: string | null) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(url, { categoryId });
      return next;
    });
  }

  function clearOverride(url: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.delete(url);
      return next;
    });
  }

  async function importSelected() {
    const toImport = bookmarks.filter((b) => selected.has(b.url) && normalizeUrl(b.url));
    if (toImport.length === 0) return;
    setStage("importing");
    setProgress({ phase: "saving", done: 0, total: toImport.length });

    // Resolve each selected group's stack choice into a real stack id —
    // create any "new stack" choices once per group, not once per bookmark.
    const stackIdByGroupKey = new Map<string, string>();
    for (const g of groups) {
      const key = GROUP_KEY(g.folder);
      const inGroupSelected = g.bookmarks.some((b) => selected.has(b.url));
      if (!inGroupSelected) continue;
      const choice = groupChoices.get(key);
      if (!choice) continue;
      if (choice.stackMode === "existing" && choice.existingStackId) {
        stackIdByGroupKey.set(key, choice.existingStackId);
      } else if (choice.stackMode === "new" && choice.newStackName.trim()) {
        try {
          const stack = await addStack({ name: choice.newStackName.trim(), description: "", icon: "📦", color: "accent" });
          stackIdByGroupKey.set(key, stack.id);
        } catch {
          // Stack creation failing shouldn't sink the import — the
          // resources in that group just won't get a stack assigned.
        }
      }
    }

    // Save in chunks so large imports show real incremental progress
    // instead of one long blocking request.
    const CHUNK_SIZE = 25;
    let importedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const created: Resource[] = [];

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookmarks: chunk.map((b) => {
              const key = GROUP_KEY(b.folder);
              const choice = groupChoices.get(key);
              const stackId = stackIdByGroupKey.get(key);
              const override = overrides.get(b.url);
              return {
                title: b.title,
                url: b.url,
                folder: b.folder,
                categoryId: override ? override.categoryId : (choice?.categoryId ?? null),
                stackIds: stackId ? [stackId] : [],
                tagNames: choice?.tagNames ?? [],
              };
            }),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Import failed");
        importedCount += body.imported;
        duplicateCount += body.duplicates;
        failedCount += body.failed?.length ?? 0;
        created.push(...(body.created ?? []));
      } catch {
        failedCount += chunk.length;
      }
      setProgress({ phase: "saving", done: Math.min(i + CHUNK_SIZE, toImport.length), total: toImport.length });
    }

    // Every saved resource shows up immediately, even before enrichment.
    await hydrate();

    // Enrich metadata afterward, with limited concurrency — never blocks
    // the basic import, and a failed fetch just leaves the bookmark's
    // original title/URL in place rather than failing the resource.
    let enrichFailed = 0;
    if (created.length > 0) {
      setProgress({ phase: "enriching", done: 0, total: created.length });
      await runWithConcurrency(
        created,
        5,
        async (resource) => {
          try {
            const metaRes = await fetch("/api/metadata", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url: resource.url }),
            });
            const result: { ok: true; data: FetchedMetadata } | { ok: false } = await metaRes.json();
            if (result.ok) {
              await fetch(`/api/resources/${resource.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: result.data.title || resource.title,
                  description: result.data.description || "",
                }),
              });
            } else {
              enrichFailed++;
            }
          } catch {
            enrichFailed++;
          }
        },
        (done, total) => setProgress({ phase: "enriching", done, total })
      );
      await hydrate();
    }

    const categorizedCount = created.filter((r) => r.categoryId).length;
    setSummary({ imported: importedCount, duplicates: duplicateCount, failed: failedCount, enrichFailed, categorized: categorizedCount });
    setProgress(null);
    setStage("done");
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Import your bookmarks</h1>
        <p className="text-[13px] text-text-secondary">
          Bring your existing browser bookmarks into KeepYourStack.
        </p>
      </div>

      {stage === "upload" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-12 text-center transition-colors",
              dragOver ? "border-accent bg-accent-soft" : "border-border bg-surface"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-text-secondary">
              <Upload size={22} />
            </div>
            <div>
              <p className="text-[14px] font-medium text-text-primary">Drop your bookmarks.html file here</p>
              <p className="mt-1 text-[12.5px] text-text-secondary">or click to browse</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={14} /> Choose Bookmark File
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </div>

          {fileError && (
            <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-danger/30 bg-danger-soft px-3.5 py-3 text-[13px] text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              {fileError}
            </div>
          )}

          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4 text-[12.5px] text-text-secondary">
            <p className="font-medium text-text-primary">Step 1 — export from Chrome</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>Open Chrome → Bookmarks → Bookmark Manager</li>
              <li>
                Click the <span className="font-mono text-text-primary">⋮</span> menu → Export bookmarks
              </li>
              <li>
                Chrome creates a <span className="font-mono text-text-primary">bookmarks.html</span> file
              </li>
            </ol>
            <p className="mt-3 font-medium text-text-primary">Step 2 — upload it here</p>
            <p className="mt-1">
              KeepYourStack can&apos;t read your browser&apos;s bookmarks directly — this file is the bridge.
            </p>
          </div>
        </div>
      )}

      {stage === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 font-mono text-[12.5px]">
            <span className="text-text-primary">{bookmarks.length} bookmarks found</span>
            <span className="text-text-muted">·</span>
            <span className="text-warning">{duplicateUrls.size} duplicates</span>
            <span className="text-text-muted">·</span>
            <span className="text-success">{newCount} new resources</span>
            <span className="text-text-muted">·</span>
            <span className="text-accent">{selected.size} selected</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11.5px] text-text-muted">
            <span>Organization:</span>
            <span className="text-text-secondary">{suggestedCount} suggested</span>
            <span>·</span>
            <span>{Math.max(selected.size - suggestedCount, 0)} uncategorized</span>
          </div>

          <div className="flex items-center justify-between">
            <p className="truncate text-[12.5px] text-text-secondary">{fileName}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setSelected(new Set(bookmarks.map((b) => b.url)))}
                className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
              >
                Select all
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
              >
                Deselect all
              </button>
              <button
                onClick={() =>
                  setSelected(new Set(bookmarks.filter((b) => !duplicateUrls.has(b.url)).map((b) => b.url)))
                }
                className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
              >
                Select only new
              </button>
            </div>
          </div>

          <div className="flex max-h-[560px] flex-col gap-3 overflow-y-auto">
            {groups.map((group) => {
              const key = GROUP_KEY(group.folder);
              const choice = groupChoices.get(key);
              const groupSelectedCount = group.bookmarks.filter((b) => selected.has(b.url)).length;
              return (
                <div key={key} className="rounded-[var(--radius-md)] border border-border bg-surface">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
                    <div className="flex items-center gap-2 text-[12.5px] text-text-secondary">
                      <FolderOpen size={14} className="text-text-muted" />
                      <span className="font-medium text-text-primary">{group.folder ?? "No folder"}</span>
                      <span className="font-mono text-[11px] text-text-muted">
                        {groupSelectedCount}/{group.bookmarks.length} selected
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        onClick={() => toggleGroup(group, true)}
                        className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                      >
                        Select group
                      </button>
                      <span className="text-[11px] text-text-muted">·</span>
                      <button
                        onClick={() => toggleGroup(group, false)}
                        className="text-[11px] text-text-muted hover:text-text-primary cursor-pointer"
                      >
                        Deselect group
                      </button>
                    </div>
                  </div>

                  {choice && (
                    <div className="flex flex-col gap-2 border-b border-border/60 bg-surface-2/50 px-3.5 py-2.5">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                        Organize selected
                      </span>
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] text-text-muted">Category / Subcategory</span>
                          <div className="w-52">
                            <CategorySelector
                              value={choice.categoryId}
                              onChange={(categoryId) => updateGroupChoice(key, { categoryId })}
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10.5px] text-text-muted">Stack</span>
                          <div className="w-44">
                            <Dropdown
                              size="sm"
                              value={choice.stackMode === "existing" ? `existing:${choice.existingStackId}` : choice.stackMode}
                              onChange={(v) => {
                                if (v === "none") updateGroupChoice(key, { stackMode: "none" });
                                else if (v === "new") updateGroupChoice(key, { stackMode: "new" });
                                else updateGroupChoice(key, { stackMode: "existing", existingStackId: v.replace("existing:", "") });
                              }}
                              options={[
                                { value: "none", label: "No stack" },
                                ...stacks.map((s) => ({ value: `existing:${s.id}`, label: `${s.icon} ${s.name}` })),
                                {
                                  value: "new",
                                  label: `+ Create stack${choice.newStackName ? `: ${choice.newStackName}` : ""}`,
                                },
                              ]}
                            />
                          </div>
                        </div>
                        {choice.stackMode === "new" && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10.5px] text-text-muted">New stack name</span>
                            <input
                              value={choice.newStackName}
                              onChange={(e) => updateGroupChoice(key, { newStackName: e.target.value })}
                              placeholder="New stack name"
                              className="h-8 w-36 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[12.5px] text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
                            />
                          </div>
                        )}
                        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
                          <span className="text-[10.5px] text-text-muted">Tags</span>
                          <TagInput
                            value={choice.tagNames}
                            onChange={(tagNames) => updateGroupChoice(key, { tagNames })}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-0.5 p-2">
                    {group.bookmarks.map((b) => {
                      const isDup = duplicateUrls.has(b.url);
                      const isSelected = selected.has(b.url);
                      const override = overrides.get(b.url);
                      const isExpanded = expandedUrl === b.url;
                      const effective = effectiveCategoryId(b.url, key);
                      return (
                        <div key={b.url} className="rounded-[var(--radius-sm)]">
                          <div className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 hover:bg-surface-3">
                            <button
                              onClick={() => toggle(b.url)}
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border cursor-pointer",
                                isSelected ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                              )}
                            >
                              <Check size={12} />
                            </button>
                            <Favicon seed={b.title} size={24} />
                            <button
                              onClick={() => toggle(b.url)}
                              className="min-w-0 flex-1 text-left cursor-pointer"
                            >
                              <p className="truncate text-[13px] text-text-primary">{b.title}</p>
                              <p className="truncate font-mono text-[11px] text-text-muted">{getDomain(b.url)}</p>
                            </button>
                            {override && (
                              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                                Overridden
                              </span>
                            )}
                            {isDup && (
                              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                                Already saved
                              </span>
                            )}
                            <button
                              onClick={() => setExpandedUrl(isExpanded ? null : b.url)}
                              className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
                              aria-label="Edit this bookmark's organization"
                            >
                              <Pencil size={13} />
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="ml-9 flex flex-col gap-2 border-l border-border/60 pb-2 pl-3.5">
                              <span className="text-[10.5px] font-medium uppercase tracking-wide text-text-muted">
                                Override for this bookmark only
                              </span>
                              <div className="w-56">
                                <CategorySelector value={effective} onChange={(categoryId) => setOverride(b.url, categoryId)} />
                              </div>
                              {override && (
                                <button
                                  onClick={() => clearOverride(b.url)}
                                  className="w-fit text-[11.5px] text-text-muted hover:text-text-primary cursor-pointer"
                                >
                                  Use group&apos;s category instead
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStage("upload")}>
              <ArrowLeft size={14} /> Choose different file
            </Button>
            <Button onClick={() => void importSelected()} disabled={selected.size === 0}>
              Import {selected.size} Resource{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {stage === "importing" && progress && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-border bg-surface p-10 text-center">
          <p className="text-[14px] font-medium text-text-primary">
            {progress.phase === "saving" ? "Saving bookmarks…" : "Enriching metadata…"}
          </p>
          <div className="w-full max-w-xs">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[12px] text-text-muted">
              {progress.done} / {progress.total}
            </p>
          </div>
          {progress.phase === "enriching" && (
            <p className="max-w-xs text-[12px] text-text-muted">
              Your resources are already saved — this step just fills in descriptions and titles where possible.
            </p>
          )}
        </div>
      )}

      {stage === "done" && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-success/30 bg-success-soft p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
            <Check size={22} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">Import complete</p>
            <p className="mt-1 text-[13px] text-text-secondary">{summary.imported} resources added</p>
            {summary.imported > 0 && (
              <p className="text-[12.5px] text-text-secondary">
                {summary.categorized} categorized · {summary.imported - summary.categorized} need review
              </p>
            )}
            {summary.duplicates > 0 && (
              <p className="text-[12.5px] text-text-secondary">{summary.duplicates} duplicates skipped</p>
            )}
            {summary.enrichFailed > 0 && (
              <p className="text-[12.5px] text-warning">
                {summary.enrichFailed} resource{summary.enrichFailed === 1 ? "" : "s"} couldn&apos;t be enriched —
                the title and URL were still saved.
              </p>
            )}
            {summary.failed > 0 && (
              <p className="text-[12.5px] text-danger">
                {summary.failed} bookmark{summary.failed === 1 ? "" : "s"} failed to save.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStage("upload")}>
              Import Another File
            </Button>
            {summary.imported - summary.categorized > 0 ? (
              <Button onClick={() => router.push("/resources?needsReview=1")}>Review Uncategorized</Button>
            ) : (
              <Button onClick={() => router.push("/resources")}>View Imported Resources</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
