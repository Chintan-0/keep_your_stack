"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, FileUp, Check, ArrowLeft } from "lucide-react";
import { useStore } from "@/lib/store";
import { parseBookmarksHtml, type ParsedBookmark } from "@/lib/bookmark-import";
import { normalizeUrl, getDomain } from "@/lib/utils";
import { Favicon } from "@/components/ui/favicon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Stage = "upload" | "preview" | "done";

export default function ImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const findByUrl = useStore((s) => s.findByUrl);

  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [bookmarks, setBookmarks] = useState<ParsedBookmark[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importedCount, setImportedCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const addResource = useStore((s) => s.addResource);

  const duplicateUrls = useMemo(() => {
    const set = new Set<string>();
    for (const b of bookmarks) {
      if (findByUrl(b.url)) set.add(b.url);
    }
    return set;
  }, [bookmarks, findByUrl]);

  const newCount = bookmarks.length - duplicateUrls.size;

  async function handleFile(file: File) {
    if (!file.name.endsWith(".html") && !file.name.endsWith(".htm")) {
      toast.error("Please upload the exported Chrome bookmarks .html file.");
      return;
    }
    const text = await file.text();
    const parsed = parseBookmarksHtml(text);
    setFileName(file.name);
    setBookmarks(parsed);
    const initialSelected = new Set(
      parsed.filter((b) => !findByUrl(b.url)).map((b) => b.url)
    );
    setSelected(initialSelected);
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

  function importSelected() {
    setImporting(true);
    let count = 0;
    for (const b of bookmarks) {
      if (!selected.has(b.url)) continue;
      if (!normalizeUrl(b.url)) continue;
      const { duplicate } = addResource({ url: b.url, title: b.title });
      if (!duplicate) count++;
    }
    setImportedCount(count);
    setStage("done");
    setImporting(false);
    toast.success(`Imported ${count} resource${count === 1 ? "" : "s"}`);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-text-primary">Import Bookmarks</h1>
        <p className="text-[13px] text-text-secondary">
          Upload your exported Chrome bookmarks file to bring existing links into KeepYourStack.
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
              <FileUp size={14} /> Choose File
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

          <div className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-4 text-[12.5px] text-text-secondary">
            <p className="font-medium text-text-primary">How to export from Chrome</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4">
              <li>Open Chrome → Bookmarks → Bookmark Manager</li>
              <li>Click the ⋮ menu → Export bookmarks</li>
              <li>Upload the saved HTML file here</li>
            </ol>
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
          </div>

          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-text-secondary">{fileName}</p>
            <button
              onClick={() =>
                setSelected(new Set(bookmarks.filter((b) => !duplicateUrls.has(b.url)).map((b) => b.url)))
              }
              className="text-[12px] text-text-muted hover:text-text-primary cursor-pointer"
            >
              Select only new
            </button>
          </div>

          <div className="flex max-h-[420px] flex-col gap-1 overflow-y-auto rounded-[var(--radius-md)] border border-border bg-surface p-2">
            {bookmarks.map((b) => {
              const isDup = duplicateUrls.has(b.url);
              const isSelected = selected.has(b.url);
              return (
                <button
                  key={b.url}
                  onClick={() => toggle(b.url)}
                  className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left hover:bg-surface-3 cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border",
                      isSelected ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                    )}
                  >
                    <Check size={12} />
                  </span>
                  <Favicon seed={b.title} size={24} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] text-text-primary">{b.title}</p>
                    <p className="truncate font-mono text-[11px] text-text-muted">{getDomain(b.url)}</p>
                  </div>
                  {isDup && (
                    <span className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium text-warning">
                      Duplicate
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStage("upload")}>
              <ArrowLeft size={14} /> Choose different file
            </Button>
            <Button onClick={importSelected} disabled={selected.size === 0 || importing}>
              Import {selected.size} Resource{selected.size === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}

      {stage === "done" && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-success/30 bg-success-soft p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20 text-success">
            <Check size={22} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">Imported {importedCount} resources</p>
            <p className="mt-1 text-[13px] text-text-secondary">
              They&apos;re now in your library, ready to organize into stacks.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setStage("upload")}>
              Import Another File
            </Button>
            <Button onClick={() => router.push("/resources")}>Go to Library</Button>
          </div>
        </div>
      )}
    </div>
  );
}
