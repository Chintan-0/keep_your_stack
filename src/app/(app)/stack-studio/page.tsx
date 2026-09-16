"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  UploadCloud,
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  X,
  Wand2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { parseBookmarksHtml, looksLikeBookmarkExport, type ParsedBookmark } from "@/lib/bookmark-import";
import { normalizeUrl, categoryName } from "@/lib/utils";
import { suggestOrganization, reviewBucket } from "@/lib/stack-studio";
import { runWithConcurrency } from "@/lib/concurrency";
import { Button } from "@/components/ui/button";
import { StudioCard, type StudioItem } from "@/components/stack-studio/studio-card";
import type { Resource } from "@/lib/types";

// Stack Studio deliberately reuses, rather than reimplements, every piece
// of the existing import pipeline: parseBookmarksHtml (bookmark-import.ts),
// the deterministic organization signals in stack-studio.ts (itself a thin
// wrapper over enrichment.ts's existing suggestCategoryForResource), the
// same chunked POST /api/import the ordinary importer uses, the same
// per-resource /api/resources/{id}/enrich call the ordinary importer uses
// (bounded via the existing runWithConcurrency helper), and import_history
// (Phase 11) for the session record — no new backend import machinery,
// only a new front-end experience and the organization workspace around it.

type Stage = "entry" | "preview" | "importing" | "workspace" | "summary";

interface Classified extends ParsedBookmark {
  normalized: string | null;
  status: "new" | "duplicate" | "invalid";
}

function track(eventType: string, metadata?: Record<string, unknown>) {
  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, metadata }),
  }).catch(() => {});
}

// Matches the grid's own Tailwind breakpoints (sm/lg/xl) so the
// virtualizer's row layout lines up with the CSS grid it's windowing.
const COLUMN_BREAKPOINTS: [minWidth: number, columns: number][] = [
  [1280, 4],
  [1024, 3],
  [640, 2],
];
function columnsForWidth(width: number): number {
  for (const [minWidth, columns] of COLUMN_BREAKPOINTS) {
    if (width >= minWidth) return columns;
  }
  return 1;
}

/** Tracks how many grid columns are currently rendered, so the workspace board can be windowed by ROW instead of by individual card. */
function useResponsiveColumns(): number {
  const [columns, setColumns] = useState(() => (typeof window !== "undefined" ? columnsForWidth(window.innerWidth) : 4));
  useEffect(() => {
    function onResize() {
      setColumns(columnsForWidth(window.innerWidth));
    }
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return columns;
}

type BoardRow =
  | { type: "header"; key: string; name: string; count: number; categoryId: string | null }
  | { type: "cards"; key: string; items: StudioItem[]; categoryId: string | null };

const HEADER_ROW_ESTIMATE = 36;
const CARD_ROW_ESTIMATE = 168;

export default function StackStudioPage() {
  const router = useRouter();
  const categories = useStore((s) => s.categories);
  const stacks = useStore((s) => s.stacks);
  const addStack = useStore((s) => s.addStack);
  const bulkMoveResources = useStore((s) => s.bulkMoveResources);
  const bulkAddToStack = useStore((s) => s.bulkAddToStack);
  const bulkAddTags = useStore((s) => s.bulkAddTags);
  const bulkArchiveResources = useStore((s) => s.bulkArchiveResources);
  const hydrate = useStore((s) => s.hydrate);

  const [stage, setStage] = useState<Stage>("entry");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [filename, setFilename] = useState("");
  const [classified, setClassified] = useState<Classified[]>([]);
  const [parsing, setParsing] = useState(false);

  const [progress, setProgress] = useState({ done: 0, total: 0, phase: "" });
  const [items, setItems] = useState<StudioItem[]>([]);
  const [importStats, setImportStats] = useState({ discovered: 0, imported: 0, duplicates: 0, failed: 0, needsReview: 0 });

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reviewFilter, setReviewFilter] = useState<"all" | "confident" | "review">("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [lastBulkAction, setLastBulkAction] = useState<{ label: string; undo: () => Promise<void> } | null>(null);

  useEffect(() => {
    track("stack_studio_opened");
    // Fire once when the page itself opens — this event answers "did anyone
    // visit Stack Studio," not "did an import finish," so it belongs here,
    // not inside startOrganizing().
  }, []);

  // ── Stage: entry ─────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      setParsing(true);
      setFilename(file.name);
      try {
        const html = await file.text();
        if (!looksLikeBookmarkExport(html)) {
          toast.error("That doesn't look like a Chrome/Firefox/Edge bookmark export (HTML file).");
          setParsing(false);
          return;
        }
        const parsed = parseBookmarksHtml(html);
        if (parsed.length === 0) {
          toast.error("No bookmarks found in that file.");
          setParsing(false);
          return;
        }

        // One request for the caller's existing URLs, not one check per
        // bookmark — see /api/resources/urls's own comment.
        const existingRes = await fetch("/api/resources/urls");
        const existingBody = await existingRes.json().catch(() => ({ urls: [] }));
        const existingUrls = new Set<string>(existingRes.ok ? existingBody.urls : []);

        const seen = new Set<string>();
        const result: Classified[] = parsed.map((b) => {
          const normalized = normalizeUrl(b.url);
          if (!normalized) return { ...b, normalized: null, status: "invalid" };
          if (existingUrls.has(normalized) || seen.has(normalized)) return { ...b, normalized, status: "duplicate" };
          seen.add(normalized);
          return { ...b, normalized, status: "new" };
        });
        setClassified(result);
        track("bookmark_import_previewed", { total: result.length });
        setStage("preview");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
      } finally {
        setParsing(false);
      }
    },
    []
  );

  const newCount = classified.filter((c) => c.status === "new").length;
  const duplicateCount = classified.filter((c) => c.status === "duplicate").length;
  const invalidCount = classified.filter((c) => c.status === "invalid").length;
  const folderCount = useMemo(() => new Set(classified.map((c) => c.folder).filter(Boolean)).size, [classified]);

  // ── Stage: preview → importing ───────────────────────────────────────
  async function startOrganizing() {
    const toImport = classified.filter((c) => c.status === "new");
    if (toImport.length === 0) {
      toast.error("Nothing new to import — every link in this file is already in your library.");
      return;
    }
    track("bookmark_import_started", { total: toImport.length });
    setStage("importing");
    setProgress({ done: 0, total: toImport.length, phase: "Importing your bookmarks…" });

    const CHUNK_SIZE = 25;
    let imported = 0;
    let failed = 0;
    const created: Resource[] = [];
    const failures: { title: string; url: string; reason: string }[] = [];

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "chrome-bookmarks",
            bookmarks: chunk.map((b) => ({ title: b.title, url: b.url, folder: b.folder, createdAt: b.addedAt ?? undefined })),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Import failed");
        imported += body.imported ?? 0;
        failed += body.failed?.length ?? 0;
        failures.push(...(body.failed ?? []));
        created.push(...(body.created ?? []));
      } catch (e) {
        failed += chunk.length;
        failures.push(...chunk.map((b) => ({ title: b.title, url: b.url, reason: e instanceof Error ? e.message : "Import failed" })));
      }
      setProgress({ done: Math.min(i + CHUNK_SIZE, toImport.length), total: toImport.length, phase: "Importing your bookmarks…" });
    }

    // Best-effort deterministic enrichment, bounded concurrency — never
    // blocks the workspace from opening; runs in the background after.
    // The enrich endpoint already returns the updated resource, so there's
    // no need for a second pass of per-resource GETs afterward — at
    // Stack Studio's import scale (thousands of resources) that second
    // pass used to be an unbounded Promise.all, i.e. thousands of
    // simultaneous requests. Capturing the response here removes it
    // entirely instead of just bounding it.
    setProgress({ done: 0, total: created.length, phase: "Fetching metadata…" });
    const enrichedById = new Map<string, Resource>();
    await runWithConcurrency(
      created,
      5,
      async (resource) => {
        try {
          const res = await fetch(`/api/resources/${resource.id}/enrich`, { method: "POST" });
          const body = await res.json().catch(() => null);
          if (res.ok && body?.resource) enrichedById.set(resource.id, body.resource as Resource);
        } catch {
          // Metadata unavailable for this one — it keeps its original bookmark title, not a failed import.
        }
      },
      (done) => {
        setProgress({ done, total: created.length, phase: "Fetching metadata…" });
      }
    );

    const finalResources = created.map((r) => enrichedById.get(r.id) ?? r);

    const bookmarkByUrl = new Map(toImport.map((b) => [normalizeUrl(b.url), b]));
    const studioItems: StudioItem[] = finalResources.map((r) => {
      const bookmark = bookmarkByUrl.get(normalizeUrl(r.url) ?? "");
      const suggestion = suggestOrganization(
        { title: r.title, description: r.description, domain: r.domain, folder: bookmark?.folder ?? null },
        categories,
        stacks
      );
      return {
        id: r.id,
        title: r.title,
        url: r.url,
        domain: r.domain,
        description: r.description,
        folder: bookmark?.folder ?? null,
        categoryId: r.categoryId ?? suggestion.categoryId,
        stackId: r.stackIds[0] ?? suggestion.stackId,
        tags: suggestion.tags,
        confidence: r.categoryId ? "high" : suggestion.confidence,
        reasons: suggestion.reasons,
      };
    });

    const needsReview = studioItems.filter((i) => reviewBucket(i.confidence) === "review").length;
    setItems(studioItems);
    setImportStats({ discovered: classified.length, imported, duplicates: duplicateCount, failed, needsReview });
    void hydrate();

    void fetch("/api/import/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "chrome-bookmarks", filename, total: classified.length, imported, skipped: duplicateCount, failed, failedItems: failures.slice(0, 50) }),
    }).catch(() => {});

    track(imported > 0 ? "bookmark_import_completed" : "bookmark_import_failed", { imported, duplicates: duplicateCount, failed });
    if (duplicateCount > 0) track("bookmark_duplicate_detected", { count: duplicateCount });

    setStage("workspace");
  }

  // ── Workspace ────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    if (reviewFilter === "all") return items;
    return items.filter((i) => reviewBucket(i.confidence) === reviewFilter);
  }, [items, reviewFilter]);

  const grouped = useMemo(() => {
    const groups = new Map<string, StudioItem[]>();
    for (const item of filteredItems) {
      const key = item.categoryId ? categoryName(item.categoryId, categories) : "Needs Review";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries());
  }, [filteredItems, categories]);

  const columns = useResponsiveColumns();

  // Flattens "N groups of M cards" into "rows" — one header row per group,
  // then one row per `columns` cards — so a single window virtualizer can
  // cap rendered DOM nodes to roughly what fits the viewport (+ overscan)
  // regardless of whether there are 100 or 10,000 imported resources. Each
  // row still carries the category id it belongs to, so drag-and-drop drop
  // targets keep working per-row instead of needing one giant wrapper per
  // group (which would defeat the point — that wrapper would itself hold
  // every card in the group).
  const boardRows = useMemo<BoardRow[]>(() => {
    const rows: BoardRow[] = [];
    for (const [name, group] of grouped) {
      const categoryId = name === "Needs Review" ? null : categories.find((c) => c.name === name)?.id ?? null;
      rows.push({ type: "header", key: `h:${name}`, name, count: group.length, categoryId });
      for (let i = 0; i < group.length; i += columns) {
        rows.push({ type: "cards", key: `${name}:${i}`, items: group.slice(i, i + columns), categoryId });
      }
    }
    return rows;
  }, [grouped, categories, columns]);

  const boardListRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useWindowVirtualizer({
    count: boardRows.length,
    estimateSize: (index) => (boardRows[index]?.type === "header" ? HEADER_ROW_ESTIMATE : CARD_ROW_ESTIMATE),
    overscan: 6,
    scrollMargin: boardListRef.current?.offsetTop ?? 0,
  });

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkCategory(categoryId: string | null) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const prevItems = items;
    try {
      await bulkMoveResources(ids, categoryId);
      setItems((cur) => cur.map((i) => (ids.includes(i.id) ? { ...i, categoryId, confidence: "high" } : i)));
      const label = categoryId ? categoryName(categoryId, categories) : "Uncategorized";
      toast.success(`${ids.length} resource${ids.length === 1 ? "" : "s"} moved to ${label}.`, {
        action: { label: "Undo", onClick: () => void undoLast() },
      });
      setLastBulkAction({
        label: `Move ${ids.length} to ${label}`,
        undo: async () => {
          const byId = new Map(prevItems.map((i) => [i.id, i]));
          for (const id of ids) {
            const prev = byId.get(id);
            if (prev) await bulkMoveResources([id], prev.categoryId);
          }
          setItems(prevItems);
        },
      });
      track("bulk_organization_completed", { count: ids.length });
      setSelectedIds(new Set());
    } catch {
      // store already toasted the error and rolled back optimistic state
    }
  }

  async function applyBulkStack(stackId: string) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await bulkAddToStack(ids, stackId);
      setItems((cur) => cur.map((i) => (ids.includes(i.id) ? { ...i, stackId } : i)));
      toast.success(`Added ${ids.length} resource${ids.length === 1 ? "" : "s"} to that stack.`);
      track("bulk_organization_completed", { count: ids.length });
      setSelectedIds(new Set());
    } catch {
      // handled by store
    }
  }

  async function applyBulkTags(tagInput: string) {
    const ids = Array.from(selectedIds);
    const tagNames = tagInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (ids.length === 0 || tagNames.length === 0) return;
    try {
      await bulkAddTags(ids, tagNames);
      setItems((cur) => cur.map((i) => (ids.includes(i.id) ? { ...i, tags: Array.from(new Set([...i.tags, ...tagNames])) } : i)));
      toast.success(`Added tags to ${ids.length} resource${ids.length === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
    } catch {
      // handled by store
    }
  }

  async function applyBulkArchive() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await bulkArchiveResources(ids, true);
      setItems((cur) => cur.filter((i) => !ids.includes(i.id)));
      toast.success(`Archived ${ids.length} resource${ids.length === 1 ? "" : "s"}.`);
      setSelectedIds(new Set());
    } catch {
      // handled by store
    }
  }

  async function undoLast() {
    if (!lastBulkAction) return;
    try {
      await lastBulkAction.undo();
      toast.success("Undone.");
    } catch {
      toast.error("Couldn't undo that change.");
    } finally {
      setLastBulkAction(null);
    }
  }

  function handleDrop(e: React.DragEvent, categoryId: string | null) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const idsToMove = selectedIds.has(id) && selectedIds.size > 1 ? Array.from(selectedIds) : [id];
    setSelectedIds(new Set(idsToMove));
    void applyBulkCategory(categoryId);
  }

  async function runAutoOrganize() {
    track("auto_organize_started", { count: items.length });
    // Already computed at import time — "Apply" here just confirms what
    // was suggested, per Part L's explicit "never automatically apply
    // without confirmation" (the suggestions were shown, not applied,
    // until this click).
    let applied = 0;
    for (const [key, group] of grouped) {
      if (key === "Needs Review") continue;
      const category = categories.find((c) => c.name === key);
      if (!category) continue;
      const ids = group.filter((i) => i.categoryId !== category.id).map((i) => i.id);
      if (ids.length === 0) continue;
      try {
        await bulkMoveResources(ids, category.id);
        applied += ids.length;
      } catch {
        // one group failing shouldn't stop the rest
      }
    }
    track("auto_organize_completed", { count: applied });
    toast.success(`Organized ${applied} resource${applied === 1 ? "" : "s"}.`);
  }

  const reviewItems = useMemo(() => items.filter((i) => reviewBucket(i.confidence) === "review"), [items]);
  const currentReviewItem = reviewItems[reviewIndex];

  function openReviewMode(startId?: string) {
    const startIndex = startId ? reviewItems.findIndex((i) => i.id === startId) : 0;
    setReviewIndex(Math.max(0, startIndex));
    setReviewMode(true);
    track("review_started", { count: reviewItems.length });
  }

  async function classifyReviewItem(categoryId: string | null) {
    if (!currentReviewItem) return;
    // Classifying removes this item from the review bucket, so everything
    // after it shifts down one slot — the "next" item lands at the SAME
    // index, not index+1. Incrementing here would skip it.
    const remaining = reviewItems.length - 1;
    try {
      await bulkMoveResources([currentReviewItem.id], categoryId);
      setItems((cur) => cur.map((i) => (i.id === currentReviewItem.id ? { ...i, categoryId, confidence: "high" } : i)));
      track("resource_organization_changed", { count: 1 });
    } catch {
      // handled by store
    }
    if (remaining <= 0) {
      setReviewMode(false);
      track("review_completed", { count: reviewItems.length });
    } else {
      setReviewIndex((i) => Math.min(i, remaining - 1));
    }
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (stage === "entry") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-3 px-3 py-1 font-mono text-[11px] text-text-secondary">
          <Wand2 size={12} className="text-accent" /> Stack Studio
        </span>
        <h1 className="text-[28px] font-semibold tracking-tight text-text-primary sm:text-[34px]">
          Turn your bookmark pile into a toolbox.
        </h1>
        <p className="max-w-md text-[14px] text-text-secondary">
          Import your bookmarks, organize them visually, and keep the useful stuff.
        </p>

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
          className={`flex w-full flex-col items-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed p-10 transition-colors ${
            dragOver ? "border-accent bg-accent-soft" : "border-border-strong bg-surface"
          }`}
        >
          <UploadCloud size={28} className="text-text-muted" />
          <p className="text-[14px] font-medium text-text-primary">Bring your bookmarks home.</p>
          <p className="text-[12.5px] text-text-secondary">Drop your bookmark file here, or</p>
          <Button onClick={() => fileInputRef.current?.click()} disabled={parsing}>
            {parsing ? "Reading…" : "Choose bookmark file"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".html,text/html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <p className="text-[11px] text-text-muted">Chrome / Firefox / Edge exported HTML bookmarks</p>
        </div>

        <Link href="/" className="flex items-center gap-1 text-[12.5px] text-text-secondary hover:text-text-primary">
          <ArrowLeft size={13} /> Back to library
        </Link>
      </div>
    );
  }

  if (stage === "preview") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-14">
        <div className="flex flex-col items-center gap-2 text-center">
          <CheckCircle2 size={24} className="text-success" />
          <h1 className="text-xl font-semibold text-text-primary">Your bookmarks are ready</h1>
          <p className="text-[13px] text-text-secondary">{classified.length.toLocaleString()} links discovered</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-center">
            <p className="text-[20px] font-semibold text-text-primary">{newCount}</p>
            <p className="text-[11.5px] text-text-muted">new</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-center">
            <p className="text-[20px] font-semibold text-text-primary">{duplicateCount}</p>
            <p className="text-[11.5px] text-text-muted">already in your library</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-border bg-surface p-4 text-center">
            <p className="text-[20px] font-semibold text-text-primary">{invalidCount}</p>
            <p className="text-[11.5px] text-text-muted">invalid / skipped</p>
          </div>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 text-[12.5px] text-text-secondary">
          <p>✓ {folderCount} original folder{folderCount === 1 ? "" : "s"} preserved as import context</p>
          <p>✓ Metadata enrichment ready (title, description, favicon)</p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => setStage("entry")}>
            <ChevronLeft size={14} /> Choose a different file
          </Button>
          <Button onClick={() => void startOrganizing()} disabled={newCount === 0}>
            Start organizing <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    );
  }

  if (stage === "importing") {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-4 py-24 text-center">
        <Sparkles size={26} className="animate-pulse text-accent" />
        <h1 className="text-lg font-semibold text-text-primary">{progress.phase || "Importing your bookmarks…"}</h1>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="font-mono text-[12.5px] text-text-muted">
          {progress.done.toLocaleString()} / {progress.total.toLocaleString()}
        </p>
      </div>
    );
  }

  if (stage === "summary") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16 text-center">
        <CheckCircle2 size={28} className="mx-auto text-success" />
        <h1 className="text-xl font-semibold text-text-primary">Your toolbox is ready.</h1>
        <div className="flex flex-col gap-1 text-[13.5px] text-text-secondary">
          <p>{importStats.discovered.toLocaleString()} bookmarks processed</p>
          <p>{importStats.imported.toLocaleString()} new resources</p>
          <p>{importStats.duplicates.toLocaleString()} duplicates skipped</p>
          <p>{reviewItems.length.toLocaleString()} still need review</p>
        </div>
        <div className="grid grid-cols-1 gap-2 text-left sm:grid-cols-2">
          {grouped.map(([name, g]) => (
            <div key={name} className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[12.5px]">
              <span className="text-text-primary">{name}</span>
              <span className="font-mono text-text-muted">{g.length}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => setStage("workspace")}>
            Keep organizing
          </Button>
          <Button onClick={() => router.push("/resources")}>View my library</Button>
        </div>
      </div>
    );
  }

  // ── Workspace ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Wand2 size={18} className="text-accent" />
          <h1 className="text-lg font-semibold text-text-primary">Stack Studio</h1>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-text-muted">
            {items.length.toLocaleString()} imported
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void runAutoOrganize()}>
            <Sparkles size={13} /> Auto-organize
          </Button>
          <Button size="sm" onClick={() => setStage("summary")}>
            Done <CheckCircle2 size={13} />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "confident", "review"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setReviewFilter(f)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors cursor-pointer ${
              reviewFilter === f ? "border-accent bg-accent-soft text-accent" : "border-border text-text-secondary hover:border-border-strong"
            }`}
          >
            {f === "all" ? "All" : f === "confident" ? "High confidence" : "Needs review"}
          </button>
        ))}
        {reviewItems.length > 0 && (
          <button
            onClick={() => openReviewMode()}
            className="ml-auto rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-[12px] font-medium text-warning cursor-pointer"
          >
            Needs your brain 🧠 · {reviewItems.length}
          </button>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-accent/30 bg-accent-soft px-4 py-2.5">
          <span className="text-[13px] font-medium text-text-primary">{selectedIds.size} selected</span>
          <BulkCategoryPicker categories={categories} onPick={applyBulkCategory} />
          <BulkStackPicker stacks={stacks} onPick={applyBulkStack} onCreate={async (name) => {
            const stack = await addStack({ name, description: "", icon: "📦", color: "accent" });
            await applyBulkStack(stack.id);
          }} />
          <BulkTagInput onApply={applyBulkTags} />
          <Button variant="secondary" size="sm" onClick={() => void applyBulkArchive()}>
            Archive
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto flex items-center gap-1 text-[12px] text-text-muted hover:text-text-primary cursor-pointer">
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-border bg-surface p-10 text-center">
          <AlertTriangle size={20} className="text-text-muted" />
          <p className="text-[13.5px] text-text-secondary">Nothing to organize yet.</p>
        </div>
      ) : (
        // Windowed: only rows within (or near) the viewport are ever
        // mounted, via boardRows/rowVirtualizer above — total DOM nodes
        // stay bounded by viewport height, not by how many resources were
        // imported. Selection/drag state lives in selectedIds (a Set) and
        // items (in-memory), not on the DOM, so scrolling a row out of
        // view and back never loses it.
        <div ref={boardListRef} style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = boardRows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={row.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, row.categoryId)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                  paddingBottom: 8,
                }}
              >
                {row.type === "header" ? (
                  <h2 className="flex items-center gap-2 pt-4 text-[12.5px] font-semibold uppercase tracking-wide text-text-secondary">
                    {row.name} <span className="rounded-full bg-surface-3 px-1.5 font-mono text-[10.5px] text-text-muted">{row.count}</span>
                  </h2>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {row.items.map((item) => (
                      <StudioCard
                        key={item.id}
                        item={item}
                        categories={categories}
                        selected={selectedIds.has(item.id)}
                        onToggleSelect={() => toggleSelect(item.id)}
                        draggable
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", item.id)}
                        onOpenReview={reviewBucket(item.confidence) === "review" ? () => openReviewMode(item.id) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {reviewMode && currentReviewItem && (
        <ReviewOverlay
          item={currentReviewItem}
          index={reviewIndex}
          total={reviewItems.length}
          categories={categories}
          onClassify={classifyReviewItem}
          onNext={() => setReviewIndex((i) => Math.min(i + 1, reviewItems.length - 1))}
          onPrev={() => setReviewIndex((i) => Math.max(i - 1, 0))}
          onExit={() => setReviewMode(false)}
        />
      )}
    </div>
  );
}

function BulkCategoryPicker({ categories, onPick }: { categories: { id: string; name: string }[]; onPick: (id: string | null) => void }) {
  return (
    <select
      onChange={(e) => e.target.value && onPick(e.target.value)}
      defaultValue=""
      className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[12.5px] text-text-primary"
    >
      <option value="" disabled>
        Move to category…
      </option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function BulkStackPicker({
  stacks,
  onPick,
  onCreate,
}: {
  stacks: { id: string; name: string }[];
  onPick: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  return (
    <select
      onChange={(e) => {
        if (e.target.value === "__new__") {
          const name = prompt("New stack name?");
          if (name?.trim()) void onCreate(name.trim());
        } else if (e.target.value) onPick(e.target.value);
        e.target.value = "";
      }}
      defaultValue=""
      className="h-8 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[12.5px] text-text-primary"
    >
      <option value="" disabled>
        Add to stack…
      </option>
      {stacks.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value="__new__">+ New stack…</option>
    </select>
  );
}

function BulkTagInput({ onApply }: { onApply: (tags: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) {
          onApply(value);
          setValue("");
        }
      }}
      className="flex items-center gap-1"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add tags (comma-separated)"
        className="h-8 w-40 rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-2 text-[12.5px] text-text-primary placeholder-text-muted"
      />
      <Button type="submit" variant="secondary" size="sm">
        Add
      </Button>
    </form>
  );
}

function ReviewOverlay({
  item,
  index,
  total,
  categories,
  onClassify,
  onNext,
  onPrev,
  onExit,
}: {
  item: StudioItem;
  index: number;
  total: number;
  categories: { id: string; name: string }[];
  onClassify: (categoryId: string | null) => void;
  onNext: () => void;
  onPrev: () => void;
  onExit: () => void;
}) {
  const quickPicks = categories.slice(0, 3);

  // The listener is registered once and reads from this ref on every
  // keypress, so it always sees the latest quickPicks/handlers even if
  // `categories` changes (e.g. a background hydrate()) without the
  // reviewed item itself changing — a plain dependency array here would
  // capture a stale quickPicks and misclassify on category-list updates.
  const latestRef = useRef({ quickPicks, onClassify, onNext, onPrev, onExit });
  useEffect(() => {
    latestRef.current = { quickPicks, onClassify, onNext, onPrev, onExit };
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const current = latestRef.current;
      if (e.key === "Escape") current.onExit();
      else if (e.key === "ArrowRight") current.onNext();
      else if (e.key === "ArrowLeft") current.onPrev();
      else if (["1", "2", "3"].includes(e.key)) {
        const pick = current.quickPicks[Number(e.key) - 1];
        if (pick) current.onClassify(pick.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-md flex-col gap-4 rounded-[var(--radius-lg)] border border-border-strong bg-surface-2 p-6 shadow-2xl">
        <div className="flex items-center justify-between text-[12px] text-text-muted">
          <span>
            Needs your brain 🧠 · {index + 1} / {total}
          </span>
          <button onClick={onExit} className="cursor-pointer hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <h3 className="text-[16px] font-semibold text-text-primary">{item.title}</h3>
        <p className="truncate font-mono text-[12px] text-text-muted">{item.domain}</p>
        {item.folder && <p className="text-[12px] text-text-secondary">Original folder: {item.folder}</p>}
        {item.tags.length > 0 && <p className="text-[12px] text-text-secondary">Suggested tags: {item.tags.join(", ")}</p>}
        {item.reasons.length > 0 && (
          <p className="text-[12px] text-text-muted">
            Why it&apos;s uncertain: no exact folder/category match — closest signal: {item.reasons[0].toLowerCase()}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {quickPicks.map((c, i) => (
            <button
              key={c.id}
              onClick={() => onClassify(c.id)}
              className="flex items-center justify-between rounded-[var(--radius-sm)] border border-border-strong bg-surface-3 px-3 py-2 text-left text-[13px] text-text-primary hover:bg-surface-hover cursor-pointer"
            >
              {c.name}
              <kbd className="rounded border border-border px-1.5 text-[10.5px] text-text-muted">{i + 1}</kbd>
            </button>
          ))}
          <button
            onClick={() => onClassify(null)}
            className="rounded-[var(--radius-sm)] border border-border px-3 py-2 text-left text-[13px] text-text-secondary hover:bg-surface-3 cursor-pointer"
          >
            Skip / Uncategorized
          </button>
        </div>

        <div className="flex items-center justify-between text-[11.5px] text-text-muted">
          <button onClick={onPrev} disabled={index === 0} className="flex items-center gap-1 disabled:opacity-40 cursor-pointer">
            <ChevronLeft size={13} /> Previous
          </button>
          <span>← → to navigate · Esc to exit</span>
          <button onClick={onNext} disabled={index >= total - 1} className="flex items-center gap-1 disabled:opacity-40 cursor-pointer">
            Next <ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
