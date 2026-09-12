"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Check,
  ArrowLeft,
  AlertTriangle,
  FolderOpen,
  Pencil,
  FileSpreadsheet,
  FileJson,
  Bookmark,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { parseBookmarksHtml, looksLikeBookmarkExport, type ParsedBookmark } from "@/lib/bookmark-import";
import { groupByFolder, suggestCategoryForFolder, suggestStackForFolder } from "@/lib/import-organizer";
import { parseCsvBookmarks, detectCsvColumns, type CsvColumnMap } from "@/lib/import/csv";
import { validateBackup, type KeepYourStackBackup, type BackupResource } from "@/lib/import/backup";
import { MAX_IMPORT_ITEMS } from "@/lib/import/types";
import { runWithConcurrency } from "@/lib/concurrency";
import { normalizeUrl, getDomain, cn } from "@/lib/utils";
import { Favicon } from "@/components/ui/favicon";
import { Button } from "@/components/ui/button";
import { CategorySelector } from "@/components/category-selector";
import { Dropdown } from "@/components/ui/dropdown";
import { TagInput } from "@/components/tag-input";
import type { Resource, RememberedMapping } from "@/lib/types";

type Stage = "upload" | "csv-mapping" | "preview" | "backup-preview" | "importing" | "done";
type Format = "html" | "csv" | "json";

/** The normalized row every non-backup source (HTML or CSV) is converted into before reaching the shared preview/mapping/save pipeline — a superset of ParsedBookmark. */
interface ImportRow extends ParsedBookmark {
  description?: string;
  notes?: string;
  tags?: string[];
  source: string;
}

const GROUP_KEY = (folder: string | null) => folder ?? "__none__";
const SOURCE_LABELS: Record<string, string> = {
  chrome: "Chrome bookmarks",
  firefox: "Firefox bookmarks",
  edge: "Edge bookmarks",
  bookmarks: "Bookmark export",
  csv: "CSV file",
  "keepyourstack-backup": "KeepYourStack backup",
};

interface GroupChoice {
  categoryId: string | null;
  /** "none" | "existing" | "new" */
  stackMode: "none" | "existing" | "new";
  existingStackId: string;
  newStackName: string;
  tagNames: string[];
  /** Whether "Remember this mapping" is checked for this group's folder path. */
  remember: boolean;
}

/** A bookmark's own choice, when it's been individually corrected away from its group's. */
interface BookmarkOverride {
  categoryId: string | null;
}

interface FailedItem {
  title: string;
  url: string;
  reason: string;
}

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const findByUrl = useStore((s) => s.findByUrl);
  const stacks = useStore((s) => s.stacks);
  const categories = useStore((s) => s.categories);
  const addStack = useStore((s) => s.addStack);
  const hydrate = useStore((s) => s.hydrate);

  const [browserLabel, setBrowserLabel] = useState<"chrome" | "firefox" | "edge" | "bookmarks">("chrome");
  const [stage, setStage] = useState<Stage>("upload");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [bookmarks, setBookmarks] = useState<ImportRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [groupChoices, setGroupChoices] = useState<Map<string, GroupChoice>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, BookmarkOverride>>(new Map());
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [remembered, setRemembered] = useState<RememberedMapping[]>([]);

  // CSV column-mapping fallback, only shown when auto-detection can't find a URL column.
  const [csvHeader, setCsvHeader] = useState<string[]>([]);
  const [csvText, setCsvText] = useState("");
  const [csvColumns, setCsvColumns] = useState<CsvColumnMap>({ url: -1 });

  // JSON backup restore — a separate, simpler flow: a backup is the
  // user's own exact prior state, not a loose pile of bookmarks needing
  // folder→category judgment, so it skips the grouped mapping UI entirely.
  const [backup, setBackup] = useState<KeepYourStackBackup | null>(null);
  const [backupWarnings, setBackupWarnings] = useState<string[]>([]);

  const [progress, setProgress] = useState<{ phase: "saving" | "enriching"; done: number; total: number } | null>(
    null
  );
  const [summary, setSummary] = useState({ imported: 0, duplicates: 0, failed: 0, enrichFailed: 0, categorized: 0 });
  const [failedItems, setFailedItems] = useState<FailedItem[]>([]);
  const [showFailures, setShowFailures] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    fetch("/api/import/mappings")
      .then((r) => r.json())
      .then((body) => setRemembered(body.mappings ?? []))
      .catch(() => {});
  }, []);

  function rememberedCategoryFor(folder: string | null): string | null {
    if (!folder) return null;
    const match = remembered.find((m) => m.folderPath.toLowerCase() === folder.toLowerCase());
    return match?.categoryId ?? null;
  }

  const duplicateUrls = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookmarks) {
      if (findByUrl(b.url)) set.add(b.url);
    }
    return set;
  }, [bookmarks, findByUrl]);

  // Duplicates *within the file itself* — the same normalized URL appearing
  // more than once in the import. Only the first occurrence is kept
  // selected by default; the rest are flagged so the user can see them
  // rather than silently getting two resources merged into one anyway
  // (the backend's own unique-URL constraint would just no-op the second
  // one, but the user should see why the count doesn't match the file).
  const inFileDuplicateUrls = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const b of bookmarks) {
      const norm = normalizeUrl(b.url);
      if (!norm) continue;
      if (seen.has(norm)) dup.add(b.url);
      seen.add(norm);
    }
    return dup;
  }, [bookmarks]);

  const invalidCount = useMemo(() => bookmarks.filter((b) => !normalizeUrl(b.url)).length, [bookmarks]);
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

  function seedGroupChoices(rows: ImportRow[]) {
    const groupedForSuggestions = groupByFolder(rows);
    const choices = new Map<string, GroupChoice>();
    for (const g of groupedForSuggestions) {
      const remembered = rememberedCategoryFor(g.folder);
      const categoryId = remembered ?? suggestCategoryForFolder(g.folder, categories);
      const stackSuggestion = suggestStackForFolder(g.folder, stacks);
      choices.set(GROUP_KEY(g.folder), {
        categoryId,
        stackMode: stackSuggestion.existingStackId ? "existing" : stackSuggestion.suggestedName ? "new" : "none",
        existingStackId: stackSuggestion.existingStackId ?? "",
        newStackName: stackSuggestion.suggestedName ?? "",
        tagNames: [],
        remember: false,
      });
    }
    setGroupChoices(choices);
  }

  function finishParsing(rows: ImportRow[], name: string) {
    setFileName(name);
    setBookmarks(rows);
    setSelected(new Set(rows.filter((b) => normalizeUrl(b.url) && !findByUrl(b.url)).map((b) => b.url)));
    setOverrides(new Map());
    seedGroupChoices(rows);
    setStage("preview");
  }

  async function handleHtmlFile(file: File) {
    const text = await file.text();
    if (!looksLikeBookmarkExport(text)) {
      setFileError(
        "This doesn't look like a browser bookmark file. Try exporting your bookmarks and upload the HTML file again."
      );
      return;
    }
    const parsed = parseBookmarksHtml(text);
    if (parsed.length === 0) {
      setFileError("No bookmarks were found in that file.");
      return;
    }
    if (parsed.length > MAX_IMPORT_ITEMS) {
      setFileError(`This file has ${parsed.length} bookmarks — the limit is ${MAX_IMPORT_ITEMS} per import.`);
      return;
    }
    finishParsing(
      parsed.map((b) => ({ ...b, source: browserLabel })),
      file.name
    );
  }

  function csvRowsToImportRows(items: { title: string; url: string; description?: string; tags?: string[]; folderPath?: string | null; notes?: string }[]): ImportRow[] {
    return items.map((i) => ({
      title: i.title,
      url: i.url,
      folder: i.folderPath ?? null,
      addedAt: null,
      description: i.description,
      notes: i.notes,
      tags: i.tags,
      source: "csv",
    }));
  }

  async function handleCsvFile(file: File) {
    const text = await file.text();
    const rows = text.split(/\r\n|\r|\n/).filter(Boolean);
    if (rows.length < 2) {
      setFileError("That CSV file doesn't have any data rows.");
      return;
    }
    const headerLine = rows[0].split(","); // good enough for a header sniff; the real parser handles quoting properly
    const detected = detectCsvColumns(headerLine);
    setCsvHeader(headerLine);
    setCsvText(text);

    if (detected.url === undefined) {
      // Can't confidently find a URL column — ask the user to map it
      // rather than guessing wrong and silently dropping every row.
      setCsvColumns({ url: -1, ...detected });
      setFileName(file.name);
      setStage("csv-mapping");
      return;
    }

    const { items, invalidRows } = parseCsvBookmarks(text, detected as CsvColumnMap);
    if (items.length === 0) {
      setFileError(
        invalidRows.length > 0
          ? "Every row in that file was missing a URL."
          : "No rows were found in that file."
      );
      return;
    }
    if (items.length > MAX_IMPORT_ITEMS) {
      setFileError(`This file has ${items.length} rows — the limit is ${MAX_IMPORT_ITEMS} per import.`);
      return;
    }
    finishParsing(csvRowsToImportRows(items), file.name);
  }

  function confirmCsvMapping() {
    if (csvColumns.url < 0) {
      setFileError("Choose which column contains the URL.");
      return;
    }
    const { items } = parseCsvBookmarks(csvText, csvColumns);
    if (items.length === 0) {
      setFileError("No rows had a value in the URL column you chose.");
      return;
    }
    finishParsing(csvRowsToImportRows(items), fileName);
  }

  async function handleJsonFile(file: File) {
    const text = await file.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setFileError("That file isn't valid JSON.");
      return;
    }
    const result = validateBackup(parsed);
    if (!result.ok) {
      setFileError(result.error);
      return;
    }
    setFileName(file.name);
    setBackup(result.backup);
    setBackupWarnings(result.warnings);
    setStage("backup-preview");
  }

  async function handleFile(file: File, format: Format) {
    setFileError(null);
    if (format === "html") return handleHtmlFile(file);
    if (format === "csv") return handleCsvFile(file);
    return handleJsonFile(file);
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
        if (select && !duplicateUrls.has(b.url) && normalizeUrl(b.url)) next.add(b.url);
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
        remember: false,
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

  async function recordHistory(source: string, total: number, imported: number, skipped: number, failed: number, items: FailedItem[]) {
    try {
      await fetch("/api/import/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, filename: fileName, total, imported, skipped, failed, failedItems: items }),
      });
    } catch {
      // History is a convenience log, not the source of truth — never worth failing the import over.
    }
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
      // "Remember this mapping" — one write per group, not per bookmark.
      if (choice.remember && choice.categoryId && g.folder) {
        try {
          await fetch("/api/import/mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderPath: g.folder, categoryId: choice.categoryId }),
          });
        } catch {
          // Not worth failing the import over — the user can set it again later.
        }
      }
    }

    const source = toImport[0]?.source ?? "chrome-bookmarks";
    const CHUNK_SIZE = 25;
    let importedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const created: Resource[] = [];
    const failures: FailedItem[] = [];

    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source,
            bookmarks: chunk.map((b) => {
              const key = GROUP_KEY(b.folder);
              const choice = groupChoices.get(key);
              const stackId = stackIdByGroupKey.get(key);
              const override = overrides.get(b.url);
              return {
                title: b.title,
                url: b.url,
                folder: b.folder,
                description: b.description,
                notes: b.notes,
                categoryId: override ? override.categoryId : (choice?.categoryId ?? null),
                stackIds: stackId ? [stackId] : [],
                tagNames: [...(choice?.tagNames ?? []), ...(b.tags ?? [])],
                createdAt: b.addedAt ?? undefined,
              };
            }),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Import failed");
        importedCount += body.imported;
        duplicateCount += body.duplicates;
        failedCount += body.failed?.length ?? 0;
        failures.push(...(body.failed ?? []));
        created.push(...(body.created ?? []));
      } catch (e) {
        failedCount += chunk.length;
        failures.push(...chunk.map((b) => ({ title: b.title, url: b.url, reason: e instanceof Error ? e.message : "Import failed" })));
      }
      setProgress({ phase: "saving", done: Math.min(i + CHUNK_SIZE, toImport.length), total: toImport.length });
    }

    await hydrate();

    let enrichFailed = 0;
    if (created.length > 0) {
      setProgress({ phase: "enriching", done: 0, total: created.length });
      await runWithConcurrency(
        created,
        5,
        async (resource) => {
          try {
            const res = await fetch(`/api/resources/${resource.id}/enrich`, { method: "POST" });
            const body = await res.json();
            if (!res.ok || body.status === "failed") enrichFailed++;
          } catch {
            enrichFailed++;
          }
        },
        (done, total) => setProgress({ phase: "enriching", done, total })
      );
      await hydrate();
    }

    const createdIds = new Set(created.map((r) => r.id));
    const categorizedCount = useStore.getState().resources.filter((r) => createdIds.has(r.id) && r.categoryId).length;
    setSummary({ imported: importedCount, duplicates: duplicateCount, failed: failedCount, enrichFailed, categorized: categorizedCount });
    setFailedItems(failures);
    setProgress(null);
    setStage("done");
    void recordHistory(SOURCE_LABELS[source] ?? source, toImport.length, importedCount, duplicateCount, failedCount, failures);
  }

  async function retryFailed() {
    if (failedItems.length === 0) return;
    setRetrying(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "retry",
          bookmarks: failedItems.map((f) => ({ title: f.title, url: f.url })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Retry failed");
      await hydrate();
      const stillFailed: FailedItem[] = body.failed ?? [];
      setSummary((s) => ({ ...s, imported: s.imported + body.imported, failed: stillFailed.length }));
      setFailedItems(stillFailed);
    } catch {
      // Leave the failed list as-is — the user can try again.
    } finally {
      setRetrying(false);
    }
  }

  // ── JSON backup restore ──────────────────────────────────────────────
  async function restoreBackup() {
    if (!backup) return;
    setStage("importing");
    setProgress({ phase: "saving", done: 0, total: backup.resources.length });

    let categoryIdMap: Record<string, string> = {};
    let stackIdMap: Record<string, string> = {};
    try {
      const res = await fetch("/api/import/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(backup),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "Couldn't prepare this backup for import.");
      categoryIdMap = body.categoryIdMap;
      stackIdMap = body.stackIdMap;
    } catch (e) {
      setFileError(e instanceof Error ? e.message : "Couldn't restore this backup.");
      setStage("upload");
      return;
    }

    const tagById = new Map(backup.tags.map((t) => [t.id, t.name]));
    const toRestore: BackupResource[] = backup.resources;
    const CHUNK_SIZE = 25;
    let importedCount = 0;
    let duplicateCount = 0;
    let failedCount = 0;
    const created: Resource[] = [];
    const failures: FailedItem[] = [];

    for (let i = 0; i < toRestore.length; i += CHUNK_SIZE) {
      const chunk = toRestore.slice(i, i + CHUNK_SIZE);
      try {
        const res = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: "keepyourstack-backup",
            bookmarks: chunk.map((r) => ({
              title: r.title,
              url: r.url,
              description: r.description || undefined,
              notes: r.notes || undefined,
              categoryId: r.categoryId ? categoryIdMap[r.categoryId] : null,
              stackIds: r.stackIds.map((id) => stackIdMap[id]).filter(Boolean),
              tagNames: r.tagIds.map((id) => tagById.get(id)).filter((n): n is string => !!n),
              isFavorite: r.isFavorite,
              isArchived: r.isArchived,
              createdAt: r.createdAt,
              sourceId: r.id,
            })),
          }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Restore failed");
        importedCount += body.imported;
        duplicateCount += body.duplicates;
        failedCount += body.failed?.length ?? 0;
        failures.push(...(body.failed ?? []));
        created.push(...(body.created ?? []));
      } catch (e) {
        failedCount += chunk.length;
        failures.push(...chunk.map((r) => ({ title: r.title, url: r.url, reason: e instanceof Error ? e.message : "Restore failed" })));
      }
      setProgress({ phase: "saving", done: Math.min(i + CHUNK_SIZE, toRestore.length), total: toRestore.length });
    }

    await hydrate();
    setSummary({ imported: importedCount, duplicates: duplicateCount, failed: failedCount, enrichFailed: 0, categorized: importedCount });
    setFailedItems(failures);
    setProgress(null);
    setStage("done");
    void recordHistory("KeepYourStack backup", toRestore.length, importedCount, duplicateCount, failedCount, failures);
  }

  function reset() {
    setStage("upload");
    setFileError(null);
    setBookmarks([]);
    setBackup(null);
    setFailedItems([]);
    setShowFailures(false);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Import your data</h1>
        <p className="text-[13px] text-text-secondary">
          Bring bookmarks, a spreadsheet, or a KeepYourStack backup into your library.
        </p>
      </div>

      {stage === "upload" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { format: "html" as const, icon: Bookmark, label: "Bookmarks", accept: ".html,.htm" },
                { format: "csv" as const, icon: FileSpreadsheet, label: "CSV", accept: ".csv" },
                { format: "json" as const, icon: FileJson, label: "Backup JSON", accept: ".json" },
              ]
            ).map((opt) => (
              <button
                key={opt.format}
                onClick={() => {
                  setFileError(null);
                  fileInputRef.current?.setAttribute("accept", opt.accept);
                  fileInputRef.current?.setAttribute("data-format", opt.format);
                  fileInputRef.current?.click();
                }}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-4 text-center transition-colors hover:border-accent/40 hover:bg-surface-2 cursor-pointer"
              >
                <opt.icon size={20} className="text-text-secondary" />
                <span className="text-[12.5px] font-medium text-text-primary">{opt.label}</span>
              </button>
            ))}
          </div>

          {browserLabel !== undefined && (
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <span>Bookmarks file from:</span>
              <div className="w-40">
                <Dropdown
                  size="sm"
                  value={browserLabel}
                  onChange={(v) => setBrowserLabel(v as typeof browserLabel)}
                  options={[
                    { value: "chrome", label: "Chrome" },
                    { value: "firefox", label: "Firefox" },
                    { value: "edge", label: "Edge" },
                    { value: "bookmarks", label: "Other / not sure" },
                  ]}
                />
              </div>
              <span className="text-text-muted">— they all export the same file format, this just labels it</span>
            </div>
          )}

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
              if (!file) return;
              const ext = file.name.split(".").pop()?.toLowerCase();
              const format: Format = ext === "csv" ? "csv" : ext === "json" ? "json" : "html";
              void handleFile(file, format);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border-2 border-dashed p-10 text-center transition-colors",
              dragOver ? "border-accent bg-accent-soft" : "border-border bg-surface"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-3 text-text-secondary">
              <Upload size={22} />
            </div>
            <div>
              <p className="text-[14px] font-medium text-text-primary">Drop a file here</p>
              <p className="mt-1 text-[12.5px] text-text-secondary">or choose a type above</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                const format = (e.target.getAttribute("data-format") as Format) || "html";
                if (file) void handleFile(file, format);
                e.target.value = "";
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
            <p className="font-medium text-text-primary">Bookmarks (Chrome, Firefox, Edge)</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>Open your browser&apos;s bookmark manager and choose Export bookmarks</li>
              <li>Upload the resulting <span className="font-mono text-text-primary">.html</span> file here</li>
            </ol>
            <p className="mt-3 font-medium text-text-primary">CSV</p>
            <p className="mt-1">A spreadsheet with at least a URL column — title, description, tags, category, and notes columns are recognized automatically or can be mapped by hand.</p>
            <p className="mt-3 font-medium text-text-primary">Backup JSON</p>
            <p className="mt-1">
              A file from KeepYourStack&apos;s own <span className="font-mono text-text-primary">Export Backup</span> — restores your
              resources, categories, stacks, tags, and notes exactly.
            </p>
          </div>
        </div>
      )}

      {stage === "csv-mapping" && (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-3.5 py-3 text-[13px] text-text-primary">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
            We couldn&apos;t tell which column has the URL — match your file&apos;s columns below.
          </div>
          <div className="flex flex-col gap-3">
            {(["url", "title", "description", "tags", "category", "notes"] as (keyof CsvColumnMap)[]).map((field) => (
              <div key={field} className="flex items-center justify-between gap-3">
                <span className="text-[13px] capitalize text-text-primary">
                  {field}
                  {field === "url" && <span className="text-danger"> *</span>}
                </span>
                <div className="w-56">
                  <Dropdown
                    size="sm"
                    value={String((csvColumns as unknown as Record<string, number>)[field] ?? -1)}
                    onChange={(v) => setCsvColumns((prev) => ({ ...prev, [field]: Number(v) }))}
                    options={[
                      { value: "-1", label: "— None —" },
                      ...csvHeader.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` })),
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          {fileError && <p className="text-[12.5px] text-danger">{fileError}</p>}
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStage("upload")}>
              <ArrowLeft size={14} /> Choose different file
            </Button>
            <Button onClick={confirmCsvMapping}>Continue</Button>
          </div>
        </div>
      )}

      {stage === "backup-preview" && backup && (
        <div className="flex flex-col gap-4">
          <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-5">
            <p className="text-[14px] font-semibold text-text-primary">Restore from backup</p>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              Exported {new Date(backup.exportedAt).toLocaleString()} · {fileName}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[12.5px] sm:grid-cols-4">
              <div><p className="text-[17px] font-semibold text-text-primary">{backup.resources.length}</p><p className="text-text-muted">resources</p></div>
              <div><p className="text-[17px] font-semibold text-text-primary">{backup.categories.length}</p><p className="text-text-muted">categories</p></div>
              <div><p className="text-[17px] font-semibold text-text-primary">{backup.stacks.length}</p><p className="text-text-muted">stacks</p></div>
              <div><p className="text-[17px] font-semibold text-text-primary">{backup.tags.length}</p><p className="text-text-muted">tags</p></div>
            </div>
          </div>
          {backupWarnings.length > 0 && (
            <div className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-warning/30 bg-warning/10 px-3.5 py-3 text-[12.5px] text-text-primary">
              {backupWarnings.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
          )}
          <p className="text-[12.5px] text-text-secondary">
            Categories and stacks are matched by name to your existing ones (creating any that don&apos;t exist yet) — nothing is
            duplicated. Resources you&apos;ve already saved (same URL) are skipped, never overwritten.
          </p>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={reset}>
              <ArrowLeft size={14} /> Choose different file
            </Button>
            <Button onClick={() => void restoreBackup()}>Restore {backup.resources.length} Resources</Button>
          </div>
        </div>
      )}

      {stage === "preview" && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3 font-mono text-[12.5px]">
            <span className="text-text-primary">{bookmarks.length} found</span>
            <span className="text-text-muted">·</span>
            <span className="text-success">{newCount} new</span>
            <span className="text-text-muted">·</span>
            <span className="text-warning">{duplicateUrls.size} already saved</span>
            {inFileDuplicateUrls.size > 0 && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-warning">{inFileDuplicateUrls.size} duplicate in file</span>
              </>
            )}
            {invalidCount > 0 && (
              <>
                <span className="text-text-muted">·</span>
                <span className="text-danger">{invalidCount} invalid URL{invalidCount === 1 ? "" : "s"}</span>
              </>
            )}
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
                onClick={() => setSelected(new Set(bookmarks.filter((b) => normalizeUrl(b.url)).map((b) => b.url)))}
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
                  setSelected(new Set(bookmarks.filter((b) => !duplicateUrls.has(b.url) && normalizeUrl(b.url)).map((b) => b.url)))
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
                      {group.folder && (
                        <label className="flex w-fit items-center gap-1.5 pt-0.5 text-[11.5px] text-text-secondary cursor-pointer">
                          <input
                            type="checkbox"
                            checked={choice.remember}
                            onChange={(e) => updateGroupChoice(key, { remember: e.target.checked })}
                            className="h-3.5 w-3.5"
                          />
                          Remember this mapping for next time
                        </label>
                      )}
                    </div>
                  )}

                  <div className="flex flex-col gap-0.5 p-2">
                    {group.bookmarks.map((b) => {
                      const isDup = duplicateUrls.has(b.url);
                      const isFileDup = inFileDuplicateUrls.has(b.url);
                      const isInvalid = !normalizeUrl(b.url);
                      const isSelected = selected.has(b.url);
                      const override = overrides.get(b.url);
                      const isExpanded = expandedUrl === b.url;
                      const effective = effectiveCategoryId(b.url, key);
                      return (
                        <div key={b.url} className="rounded-[var(--radius-sm)]">
                          <div className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 hover:bg-surface-3">
                            <button
                              onClick={() => toggle(b.url)}
                              disabled={isInvalid}
                              className={cn(
                                "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
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
                              <p className="truncate font-mono text-[11px] text-text-muted">{isInvalid ? b.url : getDomain(b.url)}</p>
                            </button>
                            {override && (
                              <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                                Overridden
                              </span>
                            )}
                            {isInvalid && (
                              <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">
                                Invalid URL
                              </span>
                            )}
                            {!isInvalid && isFileDup && (
                              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                                Duplicate in file
                              </span>
                            )}
                            {!isInvalid && isDup && (
                              <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                                Already saved
                              </span>
                            )}
                            {!isInvalid && (
                              <button
                                onClick={() => setExpandedUrl(isExpanded ? null : b.url)}
                                className="shrink-0 rounded-md p-1.5 text-text-muted hover:bg-surface-hover hover:text-text-primary cursor-pointer"
                                aria-label="Edit this bookmark's organization"
                              >
                                <Pencil size={13} />
                              </button>
                            )}
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
            <Button variant="ghost" onClick={reset}>
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
            {progress.phase === "saving" ? "Saving…" : "Enriching metadata…"}
          </p>
          <div className="w-full max-w-xs">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%` }}
              />
            </div>
            <p className="mt-2 font-mono text-[12px] text-text-muted">
              {progress.done} / {progress.total} ({Math.round((progress.done / Math.max(progress.total, 1)) * 100)}%)
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
        <div className="flex flex-col gap-4">
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
                  {summary.failed} item{summary.failed === 1 ? "" : "s"} failed to save.
                </p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={reset}>
                Import Another File
              </Button>
              {summary.imported - summary.categorized > 0 ? (
                <Button onClick={() => router.push("/resources?needsReview=1")}>Review Uncategorized</Button>
              ) : (
                <Button onClick={() => router.push("/resources")}>View Imported Resources</Button>
              )}
            </div>
            {failedItems.length > 0 && (
              <button
                onClick={() => setShowFailures((v) => !v)}
                className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
              >
                {showFailures ? "Hide" : "View"} failures
              </button>
            )}
          </div>

          {showFailures && failedItems.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-text-primary">Failed items</p>
                <Button size="sm" variant="secondary" onClick={() => void retryFailed()} disabled={retrying}>
                  {retrying ? "Retrying…" : "Retry Failed"}
                </Button>
              </div>
              <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                {failedItems.map((f, i) => (
                  <div key={i} className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-2">
                    <p className="truncate text-[12.5px] text-text-primary">{f.title}</p>
                    <p className="truncate font-mono text-[11px] text-text-muted">{f.url}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] text-danger">
                      <AlertTriangle size={11} /> {f.reason}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
